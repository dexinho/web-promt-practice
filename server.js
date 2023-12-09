const fsp = require("fs").promises;
const fs = require("fs");
const path = require("path");
const http = require("http");

const port = 3000;
const hostname = "127.0.0.1";
const NAVIGATION_STATE = {
  currentDirPath: "",
  currentFilePath: "",
  isReadingFile: false,
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url.startsWith("/navForward")) {
      try {
        const url = req.url.split("=")[1].replace(/%20/g, " ");
        NAVIGATION_STATE.currentDirPath =
          url === "C:/"
            ? "C:\\"
            : path.join(NAVIGATION_STATE.currentDirPath, url);

        const filesAndDirs = await getFilesAndDirs(
          NAVIGATION_STATE.currentDirPath
        );
        const renderedHTML = renderDirHTML(filesAndDirs);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderedHTML);
      } catch (err) {
        console.log("Error with /navForward", err);
        NAVIGATION_STATE.currentDirPath =
          NAVIGATION_STATE.currentDirPath.replace(/\//, "");
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    } else if (req.method === "GET" && req.url === "/navBackward") {
      try {
        if (NAVIGATION_STATE.currentDirPath === "C:\\") return;

        if (!NAVIGATION_STATE.isReadingFile) pathUpOneLevel();

        NAVIGATION_STATE.isReadingFile = false;
        if (NAVIGATION_STATE.currentDirPath === "C:")
          NAVIGATION_STATE.currentDirPath = "C:\\";

        const filesAndDirs = await getFilesAndDirs(
          NAVIGATION_STATE.currentDirPath
        );
        const renderedHTML = renderDirHTML(filesAndDirs);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderedHTML);
      } catch (err) {
        console.error("Error with /navBackward:", err);

        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    } else if (req.method === "GET" && req.url === "/getPath") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(NAVIGATION_STATE.currentDirPath);
    } else if (req.method === "GET" && req.url.startsWith("/enterPath")) {
      const url = req.url.split("=")[1];
      NAVIGATION_STATE.currentDirPath = url;

      if (await isValidPath(url)) {
        const filesAndDirs = await getFilesAndDirs(
          NAVIGATION_STATE.currentDirPath
        );
        const renderedHTML = renderDirHTML(filesAndDirs);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderedHTML);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("It's not valid path!");
        return;
      }
    } else if (req.method === "GET" && req.url.startsWith("/removeItem")) {
      try {
        const itemToRemove = req.url.split("=")[1];
        await fsp.unlink(
          path.join(NAVIGATION_STATE.currentDirPath, itemToRemove)
        );
        const filesAndDirs = await getFilesAndDirs(
          NAVIGATION_STATE.currentDirPath
        );
        const renderedHTML = renderDirHTML(filesAndDirs);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderedHTML);
      } catch (err) {
        console.error("Error with /removeItem", err);

        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    } else if (req.method === "GET" && req.url.startsWith("/getIcons")) {
      const icon = req.url.split("?")[1];

      const stream = fs.createReadStream(`./assets/icons/${icon}`);
      res.writeHead(200, { "Content-Type": "image/*" });
      stream.pipe(res);
    } else if (req.method === "GET" && req.url.startsWith("/createItem")) {
      try {
        const itemName = req.url.split("=")[1];
        await fsp.writeFile(
          path.join(NAVIGATION_STATE.currentDirPath, itemName),
          ""
        );

        const filesAndDirs = await getFilesAndDirs(
          NAVIGATION_STATE.currentDirPath
        );
        const renderedHTML = renderDirHTML(filesAndDirs);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderedHTML);
      } catch (err) {
        console.error("Error with /createItem:", err);

        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    } else if (req.method === "GET" && req.url.startsWith("/readFile")) {
      const fileName = req.url.split("=")[1];
      NAVIGATION_STATE.currentFilePath = path.join(
        NAVIGATION_STATE.currentDirPath,
        fileName
      );

      const readFile = await fsp.readFile(
        NAVIGATION_STATE.currentFilePath,
        "utf-8"
      );

      NAVIGATION_STATE.isReadingFile = true;

      const renderedHTML = renderFileHTML(readFile);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderedHTML);
      return;
    } else if (req.method === "GET" && req.url.startsWith("/saveFile")) {
      try {
        const data = req.url.split(/\/saveFile\=/)[1];

        const decodedData = decodeURIComponent(data);

        const parsedData = JSON.parse(decodedData);
        let finalData = "";

        parsedData.forEach((el) => {
          finalData += el + "\n";
        });

        await fsp.writeFile(
          NAVIGATION_STATE.currentFilePath,
          finalData,
          "utf-8"
        );

        res.writeHead(200);
        res.end();
      } catch (err) {
        console.error("Error parsing JSON:", err);
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid JSON data");
        return;
      }
    } else {
      const urlPath =
        req.url === "/" ? "./public/index.html" : `./public/${req.url}`;
      const extname = String(path.extname(urlPath)).toLowerCase();

      const contentType =
        {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
        }[extname] || "application/octet-stream";

      res.statusCode = 200;
      const data = await fsp.readFile(path.join(__dirname, urlPath));

      res.setHeader("Content-Type", contentType);
      res.end(data, "utf-8");
    }
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

async function isValidPath(path) {
  try {
    await fsp.access(path);
    return true;
  } catch (err) {
    return false;
  }
}

async function getFilesAndDirs(path) {
  const items = await fsp.readdir(path, { withFileTypes: true });
  return items.map((item) => ({
    name: item.name,
    isDirectory: item.isDirectory(),
  }));
}

const pathUpOneLevel = () => {
  NAVIGATION_STATE.currentDirPath = NAVIGATION_STATE.currentDirPath.replace(
    /(\\[^\\]+)$/,
    ""
  );
  NAVIGATION_STATE.currentDirPath = NAVIGATION_STATE.currentDirPath.replace(
    /(\/[^\/]+)$/,
    ""
  );
};

function renderDirHTML(list) {
  return `
  ${list
    .map(
      (item) => `
      <div class='item-slot'>
      <img class='item-icons ${item.isDirectory ? "dir" : "file"}' alt='icon'>
  <div class='items ${item.isDirectory ? `dir` : "file"}'>${
        item.isDirectory ? `<strong>${item.name}</strong>` : item.name
      }</div>
  <button class='delete-item-btn'>X</button></div>`
    )
    .join("")}
  `;
}

function renderFileHTML(file) {
  return `
    <textarea class='file-textarea' cols='50' rows='18'>${file}</textarea>
  `;
}

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
