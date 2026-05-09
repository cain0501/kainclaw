(function attachQuestionFormModule(globalScope) {
  function parseAttributes(rawAttrs) {
    const attrs = {};
    const pattern = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(rawAttrs)) !== null) {
      attrs[match[1]] = match[2];
    }
    return attrs;
  }

  function sanitizeIdentifier(value, fallback) {
    const normalized = typeof value === "string" ? value.trim() : "";
    const safe = normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return safe || fallback;
  }

  function normalizeQuestion(rawQuestion) {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return null;
    }

    const question = rawQuestion;
    const id = sanitizeIdentifier(question.id, "");
    const label = typeof question.label === "string"
      ? question.label.trim()
      : typeof question.question === "string"
        ? question.question.trim()
        : "";
    const type = typeof question.type === "string" ? question.type.trim() : "";
    const supportedTypes = new Set(["radio", "checkbox", "text", "textarea", "select"]);

    if (!id || !label || !supportedTypes.has(type)) {
      return null;
    }

    const normalized = {
      id,
      label,
      type,
      required: question.required === true,
    };

    if (typeof question.placeholder === "string" && question.placeholder.trim()) {
      normalized.placeholder = question.placeholder.trim();
    }

    if (type === "checkbox" && Number.isFinite(question.maxSelections)) {
      normalized.maxSelections = Math.max(1, Number(question.maxSelections));
    }

    if (Array.isArray(question.options)) {
      const options = question.options
        .map(option => {
          if (typeof option === "string") {
            const value = option.trim();
            return value ? { value, label: value } : null;
          }
          if (!option || typeof option !== "object") {
            return null;
          }
          const value = typeof option.value === "string"
            ? option.value.trim()
            : typeof option.label === "string"
              ? option.label.trim()
              : "";
          const labelText = typeof option.label === "string"
            ? option.label.trim()
            : value;
          return value && labelText ? { value, label: labelText } : null;
        })
        .filter(Boolean);

      if (options.length > 0) {
        normalized.options = options;
      }
    }

    return normalized;
  }

  function tryParseForm(body, attrs) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }

    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeQuestion).filter(Boolean)
      : [];
    if (!questions.length) {
      return null;
    }

    return {
      id: sanitizeIdentifier(attrs.id, "discovery"),
      title: typeof attrs.title === "string" && attrs.title.trim() ? attrs.title.trim() : "Quick brief",
      questions,
    };
  }

  function splitOnQuestionForms(input) {
    const text = typeof input === "string" ? input : "";
    const segments = [];
    const pattern = /<question-form\b([^>]*)>([\s\S]*?)<\/question-form>/gi;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        segments.push({ kind: "text", text: before });
      }

      const raw = match[0];
      const attrs = parseAttributes(match[1] || "");
      const form = tryParseForm((match[2] || "").trim(), attrs);
      if (form) {
        segments.push({ kind: "form", form, raw });
      } else {
        segments.push({ kind: "text", text: raw });
      }

      lastIndex = pattern.lastIndex;
    }

    const tail = text.slice(lastIndex);
    if (tail) {
      segments.push({ kind: "text", text: tail });
    }

    return segments.length > 0 ? segments : [{ kind: "text", text }];
  }

  function formatAnswerValue(value) {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function formatFormAnswers(form, answers) {
    const lines = [`[form answers - ${form.id}]`];
    for (const question of form.questions) {
      const rawValue = answers?.[question.id];
      const formatted = formatAnswerValue(rawValue);
      if (!formatted) {
        continue;
      }
      lines.push(`- ${question.label}: ${formatted}`);
    }
    return lines.join("\n");
  }

  function parseFormattedFormAnswers(text, formId) {
    const raw = typeof text === "string" ? text : "";
    const headerPattern = new RegExp(
      "^\\[form answers\\s*-\\s*" + formId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\]\\s*",
      "i",
    );
    if (!headerPattern.test(raw)) {
      return null;
    }

    const answers = {};
    const lines = raw.split(/\r?\n/).slice(1);
    for (const line of lines) {
      const match = line.match(/^\s*-\s*(.+?):\s*(.+)\s*$/);
      if (!match) {
        continue;
      }
      answers[match[1].trim()] = match[2].trim();
    }
    return answers;
  }

  globalScope.KainClawQuestionForm = {
    splitOnQuestionForms,
    formatFormAnswers,
    parseFormattedFormAnswers,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
