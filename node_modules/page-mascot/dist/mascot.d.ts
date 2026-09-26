export type MascotProps = {
    /** The 3x3 sheet of head directions. A served path, or an imported image. */
    directions: string;
    /** The 3x3 sheet of expressions. */
    reactions: string;
    size?: number;
    className?: string;
    /** What a screen reader calls it. */
    label?: string;
};
export declare function Mascot(props: MascotProps): import("react").JSX.Element;
