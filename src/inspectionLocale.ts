type InspectionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type InspectionLocale = "zh-CN" | "en";

const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/u;

export function inferInspectionLocale(
  commandText: string,
  sessionMessages: readonly InspectionMessage[],
): InspectionLocale {
  const userTexts = [
    commandText,
    ...sessionMessages
      .filter(message => message.role === "user")
      .map(message => message.content),
  ];

  return userTexts.some(text => CHINESE_TEXT_PATTERN.test(text))
    ? "zh-CN"
    : "en";
}
