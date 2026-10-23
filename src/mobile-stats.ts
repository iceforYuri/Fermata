/** 移动端统计页内嵌横滑注册表：MobileShell 条带在统计页时先问它，返回 false=到界交还条带换页 */
export const statsSwipe: { current: ((dir: -1 | 1) => boolean) | null } = { current: null };

/** 统计页内视角跟手位移：外层条带保持不动，仅统计内容横移；边界才交还外层翻页 */
export const statsDrag: {
  current: {
    setOffset: (px: number, animate?: boolean) => void;
  } | null;
} = { current: null };
