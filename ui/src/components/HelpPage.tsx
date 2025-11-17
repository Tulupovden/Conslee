import React from "react";
import { useI18n } from "../i18n/I18nContext";

const HelpPage: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="help-page">
      <div className="help-content">
        <h1>{t("help.title")}</h1>

        <section className="help-section">
          <h2>{t("help.proxy.title")}</h2>
          <p>{t("help.proxy.intro")}</p>

          <div className="help-important-box">
            <strong>{t("help.proxy.important")}</strong>
            <ul>
              <li>{t("help.proxy.importantPoint1")}</li>
              <li>{t("help.proxy.importantPoint2")}</li>
              <li>{t("help.proxy.importantPoint3")}</li>
            </ul>
          </div>

          <h3>{t("help.proxy.nginx.title")}</h3>
          <p>{t("help.proxy.nginx.description")}</p>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.nginx.exampleBefore")}</code></pre>
          </div>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.nginx.exampleAfter")}</code></pre>
          </div>
          <p>{t("help.proxy.nginx.upstream")}</p>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.nginx.upstreamExample")}</code></pre>
          </div>

          <h3>{t("help.proxy.apache.title")}</h3>
          <p>{t("help.proxy.apache.description")}</p>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.apache.exampleBefore")}</code></pre>
          </div>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.apache.exampleAfter")}</code></pre>
          </div>

          <h3>{t("help.proxy.targetUrl.title")}</h3>
          <p>{t("help.proxy.targetUrl.description")}</p>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.targetUrl.example1")}</code></pre>
          </div>
          <div className="help-code-block">
            <pre><code>{t("help.proxy.targetUrl.example2")}</code></pre>
          </div>
        </section>

        <section className="help-section">
          <h2>{t("help.usage.title")}</h2>
          
          <h3>{t("help.usage.creating.title")}</h3>
          <p>{t("help.usage.creating.description")}</p>
          <ol>
            <li>{t("help.usage.creating.step1")}</li>
            <li>{t("help.usage.creating.step2")}</li>
            <li>{t("help.usage.creating.step3")}</li>
            <li>{t("help.usage.creating.step4")}</li>
            <li>{t("help.usage.creating.step5")}</li>
          </ol>

          <h3>{t("help.usage.modes.title")}</h3>
          <ul>
            <li><strong>{t("help.usage.modes.onDemand")}</strong> - {t("help.usage.modes.onDemandDesc")}</li>
            <li><strong>{t("help.usage.modes.scheduleOnly")}</strong> - {t("help.usage.modes.scheduleOnlyDesc")}</li>
            <li><strong>{t("help.usage.modes.both")}</strong> - {t("help.usage.modes.bothDesc")}</li>
          </ul>

          <h3>{t("help.usage.timeouts.title")}</h3>
          <ul>
            <li><strong>{t("help.usage.timeouts.idle")}</strong> - {t("help.usage.timeouts.idleDesc")}</li>
            <li><strong>{t("help.usage.timeouts.startup")}</strong> - {t("help.usage.timeouts.startupDesc")}</li>
          </ul>

          <h3>{t("help.usage.scheduling.title")}</h3>
          <p>{t("help.usage.scheduling.description")}</p>

          <h3>{t("help.usage.healthCheck.title")}</h3>
          <p>{t("help.usage.healthCheck.description")}</p>
        </section>

        <section className="help-section">
          <h2>{t("help.troubleshooting.title")}</h2>
          
          <h3>{t("help.troubleshooting.proxyIssue.title")}</h3>
          <p>{t("help.troubleshooting.proxyIssue.description")}</p>
          <ul>
            <li>{t("help.troubleshooting.proxyIssue.check1")}</li>
            <li>{t("help.troubleshooting.proxyIssue.check2")}</li>
            <li>{t("help.troubleshooting.proxyIssue.check3")}</li>
          </ul>

          <h3>{t("help.troubleshooting.containerIssue.title")}</h3>
          <p>{t("help.troubleshooting.containerIssue.description")}</p>
          <ul>
            <li>{t("help.troubleshooting.containerIssue.check1")}</li>
            <li>{t("help.troubleshooting.containerIssue.check2")}</li>
            <li>{t("help.troubleshooting.containerIssue.check3")}</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default HelpPage;

