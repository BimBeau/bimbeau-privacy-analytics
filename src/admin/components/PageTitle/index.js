const PageTitle = ({ children, className = "", title, ariaLabel }) => {
  const fullTitle = typeof title === "string" ? title : String(children || "");
  // The hover title can carry a longer value than the one read aloud, for an
  // address shown without its advertising parameters: the tooltip gives the
  // complete address, the accessible name stays the readable one.
  const accessibleName =
    typeof ariaLabel === "string" && ariaLabel !== "" ? ariaLabel : fullTitle;
  const classNames = ["bbpa-page-title", className].filter(Boolean).join(" ");

  return (
    <span
      className={classNames}
      title={fullTitle}
      aria-label={accessibleName}
      tabIndex={0}
    >
      {children}
    </span>
  );
};

export default PageTitle;
