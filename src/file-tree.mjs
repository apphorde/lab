import { defineProp, defineEvent, ref } from "@li3/web";

export default function fileTree() {
  const files = defineProp("files");
  const selected = defineProp("selected");
  const onSelect = defineEvent("select");
  const onNav = defineEvent("navigate");
  const expanded = ref([]);

  function toggleExpanded(path) {
    if (expanded.value.includes(path)) {
      expanded.value = expanded.value.filter((x) => x !== path);
    } else {
      expanded.value = expanded.value.concat(path);
    }
  }

  function isExpanded(path) {
    return expanded.value.includes(path);
  }

  function onRename(entry) {
    const name = prompt("File name", entry.name);
    if (name) {
      entry.name = name;
    }
  }

  return {
    files,
    expanded,
    selected,
    onSelect,
    onNav,
    isExpanded,
    toggleExpanded,
    onRename,
  };
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
            path: item.name,
            content: item.content || "",
            original: item,
          });
        }
      } else {
        let dir = currentDir.files.find(
          (f) => f.name === part && f.type === "d",
        );
        if (!dir) {
          dir = {
            type: "d",
            path: item.name,
            name: part,
            files: [],
          };
          currentDir.files.push(dir);
        }
        currentDir = dir;
      }
    });
  });

  // Recursive sorting function: Directories first, then Files, both alphabetical
  function sortTree(filesArray) {
    filesArray.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "d" ? -1 : 1; // 'd' (directories) come before 'f' (files)
      }
      return a.name.localeCompare(b.name); // Alphabetical by name
    });

    // Recursively sort children directories
    filesArray.forEach((node) => {
      if (node.type === "d") {
        sortTree(node.files);
      }
    });
  }

  sortTree(root.files);
  return root.files;
}

export function deleteFileByPath(tree, targetPath) {
  const cleanPath = targetPath.replace(/^\.\/|^\/+|\/+$/g, "");
  const parts = cleanPath.split("/");

  if (parts.length === 0 || cleanPath === "") return false;

  function recursiveDelete(filesArray, pathPartsIndex) {
    const currentPart = parts[pathPartsIndex];
    const isLastPart = pathPartsIndex === parts.length - 1;

    if (isLastPart) {
      // Find the index of the file matching the name and type 'f'
      const targetIndex = filesArray.findIndex(
        (f) => f.name === currentPart && f.type === "f",
      );
      if (targetIndex !== -1) {
        filesArray.splice(targetIndex, 1); // Delete the file
        return true;
      }
      return false;
    } else {
      // Find the next directory to step into
      const nextDir = filesArray.find(
        (f) => f.name === currentPart && f.type === "d",
      );
      if (nextDir) {
        return recursiveDelete(nextDir.files, pathPartsIndex + 1);
      }

      // Directory path broken/not found
      return false;
    }
  }

  return recursiveDelete(tree, 0);
}

export function flattenTree(tree) {
  const flatList = [];

  function traverse(nodes, currentPath = "") {
    nodes.forEach((node) => {
      // Rebuild the path segment
      const nodePath = currentPath
        ? `${currentPath}/${node.name}`
        : `./${node.name}`;

      if (node.type === "f") {
        // Use TextEncoder to get the exact size in bytes for UTF-8 text strings
        const byteSize = new TextEncoder().encode(node.content || "").length;

        flatList.push({
          header: {
            type: "file",
            name: nodePath,
            size: byteSize,
          },
          content: node.content || "",
        });
      } else if (node.type === "d") {
        // Add the directory entry itself
        flatList.push({
          header: {
            type: "directory",
            name: nodePath,
            size: 0,
          },
          content: "",
        });

        // Recursively flatten children contents
        if (Array.isArray(node.files)) {
          traverse(node.files, nodePath);
        }
      }
    });
  }

  traverse(tree);
  return flatList;
}
