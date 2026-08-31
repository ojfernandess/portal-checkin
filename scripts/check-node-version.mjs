const [major, minor] = process.versions.node.split(".").map(Number);

const supported =
  (major === 20 && minor >= 19) ||
  (major === 22 && minor >= 12) ||
  major > 22;

if (!supported) {
  console.error(
    `\nNode.js ${process.versions.node} is not supported. This project requires Node ^20.19.0 or >=22.12.0 (see .nvmrc).\n`,
  );
  console.error("With fnm: fnm install 22 && fnm use\n");
  process.exit(1);
}
