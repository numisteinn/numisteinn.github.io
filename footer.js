document.addEventListener("DOMContentLoaded", function () {
  const footer = document.querySelector("footer");
  if (footer) {
    const last_updated = new Date(document.lastModified);
    const formatted_date = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
    }).format(last_updated);

    footer.textContent = `Last updated: ${formatted_date}`;
  }
});
