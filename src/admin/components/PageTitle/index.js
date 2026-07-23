const PageTitle = ({ children, className = "", title }) => {
  const fullTitle = typeof title === "string" ? title : String(children || "");
  const classNames = ["bbpa-page-title", className].filter(Boolean).join(" ");

  return (
    <span className={classNames} title={fullTitle}>
      {children}
    </span>
  );
};

export default PageTitle;
