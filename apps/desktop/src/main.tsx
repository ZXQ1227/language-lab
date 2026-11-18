import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { useLocaleStore } from "./stores/locale";
import { i18n } from "./i18n";

document.getElementById("root")!.textContent = i18n.t("common:languageLab");
async function bootstrap() {
  await useLocaleStore.getState().initialize();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void bootstrap();
