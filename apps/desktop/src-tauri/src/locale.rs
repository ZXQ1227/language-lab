//! Read OS display-language and regional preferences; never infer learning language.
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLocaleInfo {
    pub system_locale: String,
    pub region_locale: String,
}

fn normalize_tag(value: &str) -> Option<String> {
    let tag = value.trim().split(['.', '@']).next()?.replace('_', "-");
    if tag.is_empty()
        || tag.len() > 128
        || tag == "C"
        || tag == "POSIX"
        || !tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        None
    } else {
        Some(tag)
    }
}

pub fn read_system_locale() -> SystemLocaleInfo {
    let system_locale = sys_locale::get_locale()
        .and_then(|v| normalize_tag(&v))
        .unwrap_or_else(|| "en-US".to_string());
    let region_locale = regional_locale()
        .and_then(|v| normalize_tag(&v))
        .unwrap_or_else(|| system_locale.clone());
    SystemLocaleInfo {
        system_locale,
        region_locale,
    }
}

#[cfg(target_os = "windows")]
fn regional_locale() -> Option<String> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetUserDefaultLocaleName(buffer: *mut u16, count: i32) -> i32;
    }
    let mut buffer = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH, including NUL.
                                 // SAFETY: The OS receives a writable buffer and its exact capacity.
    let length = unsafe { GetUserDefaultLocaleName(buffer.as_mut_ptr(), buffer.len() as i32) };
    if length > 1 && length as usize <= buffer.len() {
        String::from_utf16(&buffer[..length as usize - 1]).ok()
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
fn regional_locale() -> Option<String> {
    use std::ffi::{c_char, c_void, CStr};
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFLocaleCopyCurrent() -> *const c_void;
        fn CFLocaleGetIdentifier(locale: *const c_void) -> *const c_void;
        fn CFStringGetCString(
            value: *const c_void,
            buffer: *mut c_char,
            capacity: isize,
            encoding: u32,
        ) -> u8;
        fn CFRelease(value: *const c_void);
    }
    // SAFETY: CopyCurrent owns one retained reference. Identifier is borrowed
    // until CFRelease; successful GetCString writes a NUL-terminated UTF-8 copy.
    unsafe {
        let locale = CFLocaleCopyCurrent();
        if locale.is_null() {
            return None;
        }
        let identifier = CFLocaleGetIdentifier(locale);
        let mut buffer = [0 as c_char; 256];
        let copied = !identifier.is_null()
            && CFStringGetCString(
                identifier,
                buffer.as_mut_ptr(),
                buffer.len() as isize,
                0x0800_0100,
            ) != 0;
        let result = if copied {
            CStr::from_ptr(buffer.as_ptr())
                .to_str()
                .ok()
                .map(str::to_owned)
        } else {
            None
        };
        CFRelease(locale);
        result
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn regional_locale() -> Option<String> {
    ["LC_ALL", "LC_TIME", "LANG"]
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_os_tags_without_selecting_a_supported_ui_language() {
        assert_eq!(normalize_tag("zh_TW.UTF-8"), Some("zh-TW".into()));
        assert_eq!(normalize_tag("fr_FR@euro"), Some("fr-FR".into()));
        assert_eq!(normalize_tag("zh-Hant-HK"), Some("zh-Hant-HK".into()));
        for value in ["C", "POSIX", "", "bad locale", "../../private"] {
            assert_eq!(normalize_tag(value), None);
        }
    }
    #[test]
    fn reports_nonempty_system_and_region_tags() {
        let info = read_system_locale();
        assert!(normalize_tag(&info.system_locale).is_some());
        assert!(normalize_tag(&info.region_locale).is_some());
        let value = serde_json::to_value(info).unwrap();
        assert!(value.get("systemLocale").is_some());
        assert!(value.get("regionLocale").is_some());
    }
}
