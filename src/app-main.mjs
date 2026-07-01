import { hook, ref, shallowRef } from "@li3/web";
import {
  createGzipEncoder,
  createGzipDecoder,
  createTarPacker,
  unpackTar,
} from "tar";

import { buildFileTree } from "/src/file-tree.mjs";
import {
  signIn,
  getPropertyNS,
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

  for (const entry of entries) {
    const content = new TextDecoder().decode(entry.data);

    files.push({
      name: entry.header.name.replace("./", ""),
      type: entry.header.type,
      meta: entry.header,
      content,
    });
  }

  return files;
}

export async function push(name, files) {
  const manifest = files.find((f) => f.name === "package.json");

  if (!manifest) {
    const packageJson = JSON.stringify({ name });
    const packageJsonFile = { name: "package.json", body: packageJson };

    files.push(packageJsonFile);
  }

  const { readable, controller } = createTarPacker();
  const compressedStream = readable.pipeThrough(createGzipEncoder());

  for (const file of files) {
    const fileStream = controller.add({
      name: file.name,
      size: file.content.length,
      type: "file",
    });

    const writer = fileStream.getWriter();
    await writer.write(new TextEncoder().encode(file.content));
    await writer.close();
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
  const [showPreview, setPreview] = hook(false);
  const profile = ref(null);
  const files = ref([]);
  const error = ref(null);
  const openFiles = shallowRef([]);
  const openFilesSet = new Set();

  events.addEventListener("state", async (e) => {
    profile.value = e.detail;

    if (e.detail) {
      authorize(await getPropertyNS("deployKey"));
    }
  });

  async function download() {
    try {
      const list = await pull(projectName.value);
      files.value = buildFileTree(list);
    } catch (e) {
      error.value = e;
    }
  }

  async function upload() {
    await push(projectName.value, files);
  }

  function onClose(file) {
    openFilesSet.delete(file);
    openFiles.value = [...openFilesSet];
  }

  function onOpen(file) {
    openFilesSet.add(file);
    openFiles.value = [...openFilesSet];
  }

  function onSetContent(file, content) {
    file.content = content;
    file.modified = true;
  }

  function onLoadProject() {
    if (!(key && projectName.value)) return;
    download();
  }

  return {
    projectName,
    setProjectName,
    selected,
    error,
    files,
    showPreview,
    setPreview,
    signIn,

    onSetContent,
    download,
    upload,
    onOpen,
    onClose,
    onLoadProject,
    authorize,
  };
}
