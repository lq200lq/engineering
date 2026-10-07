import type { ValidationReport } from "./types.js";

export function formatValidationSummary(report: ValidationReport): string {
  const failedByLevel = {
    mandatory: report.results.filter((result) => result.status === "fail" && result.level === "mandatory").length,
    recommended: report.results.filter((result) => result.status === "fail" && result.level === "recommended").length,
    guideline: report.results.filter((result) => result.status === "fail" && result.level === "guideline").length,
  };
  const unknown = report.results.filter((result) => result.status === "unknown").length;
  const profileWarnings = report.profileWarnings?.length ?? 0;
  return [
    "检查范围：规则生成状态与 Registry 声明的确定性检查；不判断 Markdown 自然语言规则是否已遵守，也不等同于代码质量通过。",
    `结果：mandatory 失败 ${failedByLevel.mandatory}，recommended 失败 ${failedByLevel.recommended}，guideline 失败 ${failedByLevel.guideline}，无法判断 ${unknown}，Profile 警告 ${profileWarnings}。`,
  ].join("\n");
}
