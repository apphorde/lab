import { hook, ref, shallowRef, computed } from "@li3/web";
import {
  createGzipEncoder,
  createGzipDecoder,
  createTarPacker,
  unpackTar,
} from "tar";

let key = "";

export async function pull(name) {
  const res = await fetch("https://static.apphor.de/" + name, {
    method: "COPY",
    headers: {
      Authorization: key,
    },
  });

  if (!res.body) return [];

  const entries = await unpackTar(
    response.body.pipeThrough(createGzipDecoder()),
  );
  const files = [];

  for (const entry of entries) {
    const content = new TextDecoder().decode(entry.data);

    files.push({
      name: entry.header.name,
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
  const files = ref([]);
  const error = ref(null);
  const selected = shallowRef(null);

  async function download() {
    try {
      files.value = await pull(projectName.value);
    } catch (e) {
      error.value = e;
    }
  }

  async function upload() {
    await push(projectName.value, files);
  }

  function openFile(file) {
    selected.value = file;
  }

  function onSubmit() {
    if (!(key && projectName.value)) return;
    download();
  }

  return {
    projectName,
    setProjectName,
    selected,
    error,
    files,
    download,
    upload,
    openFile,
    authorize,
    onSubmit,
  };
}
