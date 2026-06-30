import { hook, ref, shallowRef, computed } from "@li3/web";
import { packTar, unpackTar } from "tar";

let key = "";

export async function pull(name) {
  const res = await fetch("https://static.apphor.de/" + name, {
    method: "COPY",
    headers: {
      Authorization: key,
    },
  });

  const tarBuffer = await res.arrayBuffer();
  const entries = await unpackTar(tarBuffer);
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
  const manifest = files.find((f) => f.header.name === "package.json");

  if (!manifest) {
    const packageJson = JSON.stringify({ name });
    const packageJsonFile = {
      header: { name: "package.json", size: packageJson.length },
      body: packageJson,
    };

    files.push(packageJsonFile);
  }

  const tarBuffer = await packTar(files);
  const res = await fetch("https://deploy.static.apphor.de/", {
    method: "POST",
    headers: {
      authorization: key,
      "content-type": "application/gzip",
    },
    body: tarBuffer,
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
    const entries = files.value.map((file) => ({
      header: { name: file.name, size: file.content.length },
      body: file.content,
    }));

    await push(projectName.value, entries);
  }

  function openFile(file) {
    selected.value = file;
  }

  return {
    projectName,
    setProjectName,
    selected,
    error,
    download,
    upload,
    openFile,
    authorize,
  };
}
