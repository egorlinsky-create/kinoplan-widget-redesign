window.__ModuleLoader__.load({
  id: "@local/prototype-review-chat",
  factory(require) {
    const React = require("react");
    let clientCtx = null;
    const REVIEW_API = "http://127.0.0.1:4173/api/review";
    const sending = new Set();

    function deliver(inputActions, text, summary, draft, lastQuote) {
      if (inputActions?.insertQuote) {
        const current = String(draft || "").trim();
        const replace = !current || current.startsWith(">") || current === String(lastQuote || "").trim();
        if (replace && current) inputActions.setDraft?.("");
        const label = String(summary || "Правки к прототипу");
        const quoteSummary = {
          label,
          title: "Киноплан",
          detail: "Правки к прототипу",
          body: text,
        };
        const ok = inputActions.insertQuote(text, quoteSummary);
        if (ok && lastQuote) lastQuote.current = text;
        if (ok) return true;
      }
      if (inputActions?.setDraft) {
        inputActions.setDraft(text);
        return true;
      }
      throw new Error("Композер недоступен");
    }

    /**
     * Невидимый мост в доке композера. Review-страница присылает текст правок
     * через postMessage, мост отправляет его в текущую сессию как обычный prompt.
     */
    function Bridge({ sessionId, inputActions, useInput }) {
      const draft = useInput((state) => state.draft);
      const draftRef = React.useRef(draft);
      draftRef.current = draft;
      const lastQuote = React.useRef("");
      const quotePending = React.useRef(false);
      const quoteVisible = React.useRef(false);

      React.useEffect(() => {
        const value = String(draft || "").trim();
        if (!quotePending.current) return;
        if (value) {
          quoteVisible.current = true;
          return;
        }
        if (!quoteVisible.current) return;
        quotePending.current = false;
        quoteVisible.current = false;
        fetch(`${REVIEW_API}/clear`, { method: "POST" }).catch(() => {});
      }, [draft]);

      React.useEffect(() => {
        if (!sessionId) return undefined;
        const onMessage = (event) => {
          const data = event.data;
          if (!data || data.type !== "kinoplan-review:send" || typeof data.text !== "string") return;
          const text = data.text.trim();
          if (!text) return;
          const reply = (payload) => {
            try { event.source?.postMessage({ type: "kinoplan-review:result", ...payload }, "*"); } catch {}
          };
          try {
            deliver(inputActions, text, data.summary, draftRef.current, lastQuote);
            quotePending.current = true;
            quoteVisible.current = Boolean(String(draftRef.current || "").trim());
            reply({ ok: true });
          } catch (error) {
            reply({ ok: false, error: String(error?.message || error) });
          }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
      }, [sessionId, inputActions]);

      // Поллинг локальной очереди review-страницы: работает и в Electron webview,
      // где у страницы нет доступа к родительскому окну DSH.
      React.useEffect(() => {
        if (!sessionId) return undefined;
        let alive = true;
        let timer = null;
        const tick = async () => {
          if (!alive) return;
          try {
            const response = await fetch(`${REVIEW_API}/pending`, { cache: "no-store" });
            if (response.ok) {
              const data = await response.json();
              for (const item of data.items || []) {
                if (!alive || sending.has(item.id)) continue;
                sending.add(item.id);
                try {
                  deliver(inputActions, item.text, item.summary, draftRef.current, lastQuote);
                  quotePending.current = true;
                  quoteVisible.current = Boolean(String(draftRef.current || "").trim());
                  await fetch(`${REVIEW_API}/ack`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id: item.id }),
                  });
                } finally {
                  sending.delete(item.id);
                }
              }
            }
          } catch {
            // страница прототипа может быть ещё не открыта
          }
          if (alive) timer = setTimeout(tick, 1200);
        };
        tick();
        return () => {
          alive = false;
          if (timer) clearTimeout(timer);
        };
      }, [sessionId]);

      return null;
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        clientCtx = ctx;
        ctx.slots.inject("conversation.composer.dock", () =>
          ctx.slots.register({ name: "conversation.composer.dock", id: "prototype-review-chat", order: 90 }, Bridge)
        );
      },
    };
  },
});
