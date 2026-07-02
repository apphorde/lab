import { hook, ref, shallowRef, onInit } from "@li3/web";
import {
  createGzipEncoder,
  createGzipDecoder,
  createTarPacker,
  unpackTar,
} from "tar";

import { buildFileTree, flattenTree } from "/src/file-tree.mjs";
import {
  signIn,
  getPropertyNS,
  getProfile,
  events,
} from "https://auth.api.apphor.de/index.mjs";

let key = "";

export async function pull(name) {
  const res = await fetch("https://static.apphor.de/" + name, {
    method: "COPY",
    headers: {
      Authorization: key,
    },
  });

  if (!res.body) return [];

  const entries = await unpackTar(res.body.pipeThrough(createGzipDecoder()));
  const files = [];
  const exclude = [".git/", ".github/"];

  for (const entry of entries) {
    const entryName = entry.header.name.replace("./", "");

    if (exclude.some((x) => entryName.startsWith(x))) continue;

    const content = entry.data ? new TextDecoder().decode(entry.data) : null;

    files.push({
      name: entryName,
      type: entry.header.type,
      meta: entry.header,
      ...(content !== null ? { content } : {}),
    });
  }

  return files;
}

export async function push(name, files) {
  const manifest = files.find((f) => f.name === "package.json");

  if (!manifest) {
    const packageJson = JSON.stringify({ name });
    const packageJsonFile = {
      header: { name: "package.json" },
      content: packageJson,
    };

    files.push(packageJsonFile);
  }

  const { readable, controller } = createTarPacker();
  const compressedStream = readable.pipeThrough(createGzipEncoder());

  for (const file of files) {
    const fileStream = controller.add(file);
    if (file.content?.length) {
      const writer = fileStream.getWriter();
      await writer.write(new TextEncoder().encode(file.content));
      await writer.close();
    }
  }

  controller.finalize();

  const res = await fetch("https://deploy.static.apphor.de/", {
    method: "POST",
    headers: {
      authorization: key,
      "content-type": "application/gzip",
    },
    body: compressedStream,
  });

  return res.ok;
}

export function authorize(newKey) {
  key = newKey;
}

export default function () {
  const [projectName, setProjectName] = hook("");
  const profile = ref(null);
  const files = ref([]);
  const error = ref(null);
  const downloading = ref(false);
  const uploading = ref(false);
  const openFiles = shallowRef([]);
  const openFilesSet = new Set();
  const [selectedFolder, onSelectFolder] = hook(null);
  const [selected, onSelectFile] = hook(null);
  const isSelected = (file) => file === selected.value;

  async function onProfileChange(user) {
    profile.value = user;

    if (user) {
      authorize(await getPropertyNS("deployKey"));
    }
  }

  events.addEventListener("state", (e) => onProfileChange(e.detail));
  onInit(async () => onProfileChange(await getProfile()));

  function onClose(file) {
    openFilesSet.delete(file);
    openFiles.value = [...openFilesSet];
  }

  function onOpen(file) {
    openFilesSet.add(file);
    openFiles.value = [...openFilesSet];
    onSelectFile(file);
  }

  function onSetContent(file, content) {
    file.content = content;
    file.modified = true;
  }

  async function onLoadProject() {
    if (!(key && projectName.value)) return;

    try {
      downloading.value = true;
      const list = await pull(projectName.value);
      files.value = buildFileTree(list);
      openFiles.value = [];
      selectedFolder.value = null;
    } catch (e) {
      error.value = e;
    } finally {
      downloading.value = false;
    }
  }

  async function onUpload() {
    if (!(key && projectName.value)) return;

    try {
      uploading.value = true;
      const list = flattenTree(files.value);
      await push(projectName.value, list);
    } catch (e) {
      error.value = e;
    } finally {
      uploading.value = false;
    }
  }

  function newFile() {
    const newFile = {
      type: "f",
      content: "",
      name: prompt("File name", "") || "new file",
    };

    if (selectedFolder.value) {
      selectedFolder.value.files = selectedFolder.value.files.concat(newFile);
    } else {
      files.value = files.value.concat(newFile);
    }

    onOpen(newFile);
  }

  function newFolder() {
    const newFile = {
      type: "d",
      name: prompt("Folder name", "") || "new-folder",
      files: [],
    };

    if (selectedFolder.value) {
      selectedFolder.value.files = selectedFolder.value.files.concat(newFile);
    } else {
      files.value = files.value.concat(newFile);
    }
  }

  return {
    projectName,
    setProjectName,
    error,
    downloading,
    uploading,
    files,
    openFiles,
    isSelected,
    selected,
    onSelectFile,

    selectedFolder,
    onSelectFolder,

    newFile,
    newFolder,

    profile,
    signIn,

    onSetContent,
    onOpen,
    onClose,
    onLoadProject,
    onUpload,
  };
}
