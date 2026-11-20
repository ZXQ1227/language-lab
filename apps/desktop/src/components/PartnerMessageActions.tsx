import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  localMessageTranslation,
  messageTranslationTimeoutMs,
  translatePartnerMessage,
} from "../conversation/translation";
import { formatNumber } from "../i18n";
import type { AppLocale } from "../i18n/types";
import { useAiProviderStore } from "../stores/aiProvider";
import { useLocaleStore } from "../stores/locale";
import { trainingGateway } from "../training/gateway";
import { toTrainingProvider } from "../training/provider";
import { trainingProviderSchema } from "../training/session";

interface Props {
  text: string;
  language: string;
  messageNumber: number;
  readDisabled: boolean;
  onRead: () => void;
}

type Translation =
  { status: "idle" | "loading" | "unconfigured" | "failed" } | { status: "ready"; text: string };

const action =
  "inline-flex min-h-8 items-center gap-2 rounded-full bg-surface px-3 text-xs font-semibold enabled:hover:bg-surface-hover disabled:opacity-50";

export function PartnerMessageActions(props: Props) {
  const target = useLocaleStore((state) => state.appLocale);
  return (
    <MessageActions
      key={JSON.stringify([target, props.language, props.text])}
      {...props}
      target={target}
    />
  );
}

function MessageActions({
  text,
  language,
  target,
  messageNumber,
  readDisabled,
  onRead,
}: Props & { target: AppLocale }) {
  const { t } = useTranslation();
  const id = useId();
  const pending = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [translation, setTranslation] = useState<Translation>({ status: "idle" });

  useEffect(() => () => pending.current?.abort(), []);

  async function translate() {
    if (pending.current) return;
    const local = localMessageTranslation(text, language, target);
    if (local !== undefined) {
      setTranslation({ status: "ready", text: local });
      return;
    }

    const request = new AbortController();
    pending.current = request;
    setTranslation({ status: "loading" });
    const timer = setTimeout(() => {
      request.abort();
      pending.current = null;
      setTranslation({ status: "failed" });
    }, messageTranslationTimeoutMs);
    request.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    try {
      const store = useAiProviderStore.getState();
      if (!store.loaded || store.error) await store.load();
      if (request.signal.aborted) return;
      const connection = useAiProviderStore.getState();
      if (!connection.loaded || connection.error)
        throw new Error("Could not load translation provider");
      if (!connection.configured) {
        setTranslation({ status: "unconfigured" });
        return;
      }
      const provider = trainingProviderSchema.parse(toTrainingProvider(connection.settings));
      const gateway = await trainingGateway(provider);
      if (request.signal.aborted) return;
      const translated = await translatePartnerMessage(gateway, text, target, request.signal);
      if (!request.signal.aborted) setTranslation({ status: "ready", text: translated });
    } catch {
      if (!request.signal.aborted) setTranslation({ status: "failed" });
    } finally {
      clearTimeout(timer);
      if (pending.current === request) pending.current = null;
    }
  }

  return (
    <>
      <div id={id} hidden={!open} className="mt-2 text-sm leading-relaxed sm:text-base">
        {translation.status === "ready" && (
          <p lang={target} role="status" className="whitespace-pre-wrap wrap-break-word">
            {translation.text}
          </p>
        )}
        {translation.status === "loading" && (
          <p role="status">{t("training:translation.loading")}</p>
        )}
        {translation.status === "unconfigured" && (
          <p role="status">{t("training:translation.unconfigured")}</p>
        )}
        {translation.status === "failed" && (
          <div className="flex flex-wrap items-center gap-x-2">
            <p role="alert">{t("training:translation.failed")}</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void translate()}
            >
              {t("training:translation.retry")}
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={action} disabled={readDisabled} onClick={onRead}>
          <span className="lesson-icon lesson-icon-speaker" aria-hidden="true" />
          <span>
            {t("training:readMessage")}
            <span className="sr-only"> {formatNumber(messageNumber)}</span>
          </span>
        </button>
        <button
          type="button"
          className={`${action} text-brand-ink`}
          aria-controls={id}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (!open && translation.status !== "ready") void translate();
          }}
        >
          {t(open ? "training:translation.hide" : "training:translation.show")}
          <span className="sr-only"> {formatNumber(messageNumber)}</span>
        </button>
      </div>
    </>
  );
}
