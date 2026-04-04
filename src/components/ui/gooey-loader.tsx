import * as React from "react";
import { cn } from "@/lib/utils";

export interface GooeyLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  primaryColor?: string;
  secondaryColor?: string;
  borderColor?: string;
}

const GooeyLoader = React.forwardRef<HTMLDivElement, GooeyLoaderProps>(
  ({ className, primaryColor, secondaryColor, borderColor, ...props }, ref) => {
    const style = {
      "--gooey-primary-color": primaryColor || "hsl(var(--primary))",
      "--gooey-secondary-color": secondaryColor || "hsl(var(--secondary))",
      "--gooey-border-color": borderColor || "hsl(var(--border))",
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-center", className)}
        style={style}
        {...props}
      >
        <svg className="absolute" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="gooey-loader-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>

        <style>{`
          .gooey-loader-container {
            width: 12em;
            height: 3em;
            position: relative;
            filter: url(#gooey-loader-filter);
          }
          .gooey-loader-container::before,
          .gooey-loader-container::after {
            content: "";
            display: block;
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 2em;
            height: 2em;
            border-radius: 50%;
            background: var(--gooey-primary-color);
          }
          .gooey-loader-container::before {
            animation: gooey-loader-wee1 2s infinite ease-in-out;
          }
          .gooey-loader-container::after {
            animation: gooey-loader-wee2 2s infinite ease-in-out;
            animation-delay: -1s;
          }
          .gooey-loader-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 2.5em;
            height: 2.5em;
            border-radius: 50%;
            background: var(--gooey-primary-color);
          }

          @keyframes gooey-loader-wee1 {
            0% { transform: translateX(-10em) rotate(0deg); }
            100% { transform: translateX(7em) rotate(180deg); }
          }
          @keyframes gooey-loader-wee2 {
            0% { transform: translateX(-8em) rotate(0deg); }
            100% { transform: translateX(8em) rotate(180deg); }
          }
        `}</style>

        <div className="gooey-loader-container">
          <div className="gooey-loader-dot" />
        </div>
      </div>
    );
  }
);
GooeyLoader.displayName = "GooeyLoader";

export { GooeyLoader };
