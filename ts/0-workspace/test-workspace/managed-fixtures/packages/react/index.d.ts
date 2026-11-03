/** ComponentType describes the callable fixture component shape. */
export type ComponentType<Props = Record<string, never>> = (props: Props) => unknown
