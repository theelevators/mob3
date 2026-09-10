import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useMob3App, type UseMob3AppHookOptions } from "./useMob3App.js";
import type { App } from "mob3";

export type Mob3CanvasProps = UseMob3AppHookOptions & {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode | ((ctx: { app: App | null }) => ReactNode);
};

const defaultCanvasStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  touchAction: "none",
};

/**
 * Full-bleed canvas host with Strict Mode–safe mob3 lifecycle.
 */
export function Mob3Canvas({
  className,
  style,
  children,
  canvasRef: externalRef,
  ...options
}: Mob3CanvasProps) {
  const { app, canvasRef } = useMob3App({
    ...options,
    ...(externalRef ? { canvasRef: externalRef } : {}),
  });

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        minHeight: 240,
        ...style,
      }}
    >
      <canvas ref={canvasRef as RefObject<HTMLCanvasElement>} style={defaultCanvasStyle} />
      {typeof children === "function" ? children({ app }) : children}
    </div>
  );
}
