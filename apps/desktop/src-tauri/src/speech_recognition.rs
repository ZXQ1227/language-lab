//! Device speech recognition (macOS Speech framework).
//!
//! Transcribes a finished recording with the OS built-in recognizer: no API
//! key, no network dependency when the language supports on-device models.
//! Recordings arrive in memory from the webview, are written to a temporary
//! file for `SFSpeechURLRecognitionRequest`, and the file is removed after the
//! task finishes. Transcripts are never persisted.

use std::sync::mpsc;
use std::time::Duration;

use objc2::AnyThread;
use objc2_foundation::{NSError, NSLocale, NSString, NSURL};
use objc2_speech::{
    SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus, SFSpeechURLRecognitionRequest,
};
use serde::Serialize;

const RECOGNITION_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTranscription {
    pub text: String,
    pub confidence: Option<f64>,
}

/// BCP-47 identifier for the recognizer. The course language arrives as an
/// ISO hint ("en", "zh") or a full tag ("en-US"); expand bare codes to a
/// sensible default region so `SFSpeechRecognizer` gets a concrete locale.
fn locale_identifier(language: Option<&str>) -> String {
    match language.map(str::trim).filter(|value| !value.is_empty()) {
        Some(tag) if tag.contains('-') => tag.to_lowercase(),
        Some(code) => match code.to_lowercase().as_str() {
            "en" => "en-US".into(),
            "zh" | "cmn" => "zh-CN".into(),
            "ja" => "ja-JP".into(),
            "ko" => "ko-KR".into(),
            "fr" => "fr-FR".into(),
            "de" => "de-DE".into(),
            "es" => "es-ES".into(),
            "it" => "it-IT".into(),
            "pt" => "pt-BR".into(),
            "ru" => "ru-RU".into(),
            "ar" => "ar-SA".into(),
            other => other.into(),
        },
        None => "en-US".into(),
    }
}

/// MediaRecorder output formats on macOS WKWebView map to Speech-compatible
/// containers. webm/opus is not decodable by Apple Speech.
fn extension_for_mime(mime: &str) -> Result<&'static str, String> {
    let base = mime.split(';').next().unwrap_or("").trim().to_lowercase();
    match base.as_str() {
        "audio/mp4" | "audio/aac" | "audio/x-m4a" | "audio/m4a" => Ok("m4a"),
        "audio/wav" | "audio/x-wav" | "audio/wave" => Ok("wav"),
        "audio/mpeg" | "audio/mp3" => Ok("mp3"),
        "audio/aiff" | "audio/x-aiff" => Ok("aiff"),
        "audio/ogg" | "audio/webm" => Err(
            "Device recognition cannot decode this recording format. Switch to a custom API endpoint in Settings."
                .into(),
        ),
        other => Err(format!("Unsupported recording format: {other}")),
    }
}

fn wait_for_authorization() -> Result<(), String> {
    let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
    if status == SFSpeechRecognizerAuthorizationStatus::NotDetermined {
        let (sender, receiver) = mpsc::channel();
        let handler = block2::StackBlock::new(
            move |resolved: SFSpeechRecognizerAuthorizationStatus| {
                let _ = sender.send(resolved);
            },
        );
        unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
        // The prompt may sit unanswered; treat silence as denial instead of hanging.
        match receiver.recv_timeout(Duration::from_secs(120)) {
            Ok(resolved) if resolved == SFSpeechRecognizerAuthorizationStatus::Authorized => {}
            Ok(_) => {
                return Err(
                    "Speech recognition permission was denied. Enable Language Lab in System Settings > Privacy & Security > Speech Recognition, or switch to a custom API endpoint in Settings."
                        .into(),
                )
            }
            Err(_) => {
                return Err(
                    "Speech recognition permission prompt was not answered. Respond to the macOS prompt, or switch to a custom API endpoint in Settings."
                        .into(),
                )
            }
        }
    } else if status != SFSpeechRecognizerAuthorizationStatus::Authorized {
        return Err(
            "Speech recognition permission was denied. Enable Language Lab in System Settings > Privacy & Security > Speech Recognition, or switch to a custom API endpoint in Settings."
                .into(),
        );
    }
    Ok(())
}

fn transcribe_blocking(
    audio: &[u8],
    mime_type: &str,
    language: Option<&str>,
) -> Result<DeviceTranscription, String> {
    let extension = extension_for_mime(mime_type)?;
    let temp = std::env::temp_dir().join(format!(
        "language-lab-device-asr-{}.{extension}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    std::fs::write(&temp, audio).map_err(|e| format!("write recording failed: {e}"))?;
    let result = recognize_file(&temp, language);
    let _ = std::fs::remove_file(&temp);
    result
}

fn recognize_file(path: &std::path::Path, language: Option<&str>) -> Result<DeviceTranscription, String> {
    wait_for_authorization()?;

    let identifier = NSString::from_str(&locale_identifier(language));
    let locale = NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), &identifier);
    let recognizer =
        unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) };
    let Some(recognizer) = recognizer else {
        return Err(format!(
            "Device recognition is unavailable for {identifier}. Switch to a custom API endpoint in Settings."
        ));
    };
    if !unsafe { recognizer.isAvailable() } {
        return Err(
            "Device recognition is temporarily unavailable. Retry, or switch to a custom API endpoint in Settings."
                .into(),
        );
    }
    let on_device = unsafe { recognizer.supportsOnDeviceRecognition() };

    let path = NSString::from_str(&path.to_string_lossy());
    let url = NSURL::fileURLWithPath(&path);
    let request = unsafe {
        SFSpeechURLRecognitionRequest::initWithURL(SFSpeechURLRecognitionRequest::alloc(), &url)
    };
    unsafe { request.setRequiresOnDeviceRecognition(on_device) };
    unsafe { request.setShouldReportPartialResults(false) };

    let (sender, receiver) = mpsc::channel();
    let handler = block2::StackBlock::new(
        move |result: *mut objc2_speech::SFSpeechRecognitionResult, error: *mut NSError| {
            if let Some(error) = unsafe { error.as_ref() } {
                let description = error.localizedDescription().to_string();
                let _ = sender.send(Err(description));
                return;
            }
            let resolved = unsafe { result.as_ref() };
            let Some(result) = resolved else {
                let _ = sender.send(Err("Speech recognition returned no result".into()));
                return;
            };
            if unsafe { result.isFinal() } {
                let transcription = unsafe { result.bestTranscription() };
                let text = unsafe { transcription.formattedString().to_string() };
                let segments = unsafe { transcription.segments() };
                let count = segments.len();
                let total: f64 = segments
                    .iter()
                    .map(|segment| unsafe { segment.confidence() } as f64)
                    .sum();
                // On-device models may report zero confidence for every segment.
                let confidence = if count > 0 && total > 0.0 {
                    Some(total / count as f64)
                } else {
                    None
                };
                let _ = sender.send(Ok(DeviceTranscription { text, confidence }));
            }
        },
    );
    let task = unsafe { recognizer.recognitionTaskWithRequest_resultHandler(&request, &handler) };

    match receiver.recv_timeout(RECOGNITION_TIMEOUT) {
        Ok(Ok(transcription)) if !transcription.text.trim().is_empty() => Ok(transcription),
        Ok(Ok(_)) => {
            let _ = unsafe { task.cancel() };
            Err(
                "No speech was recognized in the recording. Record again, or switch to a custom API endpoint in Settings."
                    .into(),
            )
        }
        Ok(Err(message)) => {
            let _ = unsafe { task.cancel() };
            Err(format!("Device recognition failed: {message}"))
        }
        Err(_) => {
            let _ = unsafe { task.cancel() };
            Err(
                "Device recognition timed out. Record a shorter reply, or switch to a custom API endpoint in Settings."
                    .into(),
            )
        }
    }
}

/// Transcribes one recording with the built-in macOS recognizer. The caller
/// passes the raw bytes of a finished MediaRecorder blob; nothing is stored.
#[tauri::command]
pub async fn speech_transcribe_device(
    audio: Vec<u8>,
    mime_type: String,
    language: Option<String>,
) -> Result<DeviceTranscription, String> {
    if audio.is_empty() {
        return Err("The recording was empty. Record again, or type your reply.".into());
    }
    if audio.len() > 5 * 1024 * 1024 {
        return Err("The recording exceeded the 5 MB limit. Record a shorter reply.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_blocking(&audio, &mime_type, language.as_deref())
    })
    .await
    .map_err(|e| format!("device recognition task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_bare_language_codes_to_concrete_locales() {
        assert_eq!(locale_identifier(Some("en")), "en-US");
        assert_eq!(locale_identifier(Some("zh")), "zh-CN");
        assert_eq!(locale_identifier(Some("en-US")), "en-us");
        assert_eq!(locale_identifier(Some("pt-BR")), "pt-br");
        assert_eq!(locale_identifier(None), "en-US");
        assert_eq!(locale_identifier(Some("  ")), "en-US");
    }

    #[test]
    fn maps_recording_formats_and_rejects_webm() {
        assert_eq!(extension_for_mime("audio/mp4"), Ok("m4a"));
        assert_eq!(extension_for_mime("audio/mp4;codecs=mp4a.40.2"), Ok("m4a"));
        assert_eq!(extension_for_mime("audio/wav"), Ok("wav"));
        assert_eq!(extension_for_mime("audio/mpeg"), Ok("mp3"));
        assert!(extension_for_mime("audio/webm;codecs=opus").is_err());
        assert!(extension_for_mime("video/mp4").is_err());
    }
}
