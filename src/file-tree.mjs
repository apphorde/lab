import { defineProp, defineEvent } from "@li3/web";

export default function () {
  const files = defineProp("files");
  const onSelect = defineEvent("select");

  return { files, onSelect };
}

export function buildFileTree(fileList) {
  const root = { type: "d", name: "root", files: [] };

  fileList.forEach((item) => {
    const cleanPath = item.name.replace(/^\.\/|^\/+|\/+$/g, "");
    if (!cleanPath) return;

    const parts = cleanPath.split("/");
    let currentDir = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const isFile = isLast && item.type === "file";

      if (isFile) {
        const exists = currentDir.files.some(
          (f) => f.name === part && f.type === "f",
        );

        if (!exists) {
          currentDir.files.push({
            type: "f",
            name: part,
            path: cleanPath,
            content: item.content || "",
            original: item,
          });
        }
      } else {
        let dir = currentDir.files.find(
          (f) => f.name === part && f.type === "d",
        );

        if (!dir) {
          dir = { type: "d", path: cleanPath, name: part, files: [] };
          currentDir.files.push(dir);
        }

        currentDir = dir;
      }
    });
  });

  return root.files;
}
