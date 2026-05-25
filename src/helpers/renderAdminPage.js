const path = require("path");
const fs = require("fs");
const ejs = require("ejs");

function renderAdminPage(req, res, viewName, extraLocals = {}) {
  const templatePath = path.join(__dirname, "..", "..", "views", viewName);
  fs.readFile(templatePath, "utf8", (err, template) => {
    if (err) {
      console.error(`Error reading template ${viewName}:`, err);
      return res.status(500).send("Error loading page");
    }
    try {
      const locals = {
        baseUrl: req.baseUrl,
        adminPath: req.adminPath,
        isIframe: req.isIframe || false,
        ...extraLocals,
      };
      const html = ejs.render(template, locals, { filename: templatePath });
      res.send(html);
    } catch (renderErr) {
      console.error(`Error rendering template ${viewName}:`, renderErr);
      res.status(500).send("Error rendering page");
    }
  });
}

function adminPageHandler(viewName, extraLocalsFn) {
  return (req, res) => {
    const extra = typeof extraLocalsFn === "function" ? extraLocalsFn(req) : extraLocalsFn || {};
    renderAdminPage(req, res, viewName, extra);
  };
}

module.exports = { renderAdminPage, adminPageHandler };
