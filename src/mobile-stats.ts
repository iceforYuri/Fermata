/** 移动端统计页内嵌横滑注册表：MobileShell 条带在统计页时先问它，返回 false=到界交还条带换页 */
export const statsSwipe: { current: ((dir: -1 | 1) => boolean) | null } = { current: null };
