import styles from "./SectionHeader.module.css";

interface SectionHeaderProps {
  title: string;
  /** id for the heading, so the section can use aria-labelledby */
  id?: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, id, children }: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {children ? <div className="section-sub">{children}</div> : null}
    </header>
  );
}
