import { Capacitor } from "@capacitor/core";

// True inside the Android app, false in a normal browser
export const isNativeApp = () => Capacitor.isNativePlatform();

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Saves a file for the user.
// Browser: a normal download. Android app: writes the file, then opens the
// share sheet so it can be saved to Files/Drive or sent on WhatsApp/email.
export async function saveFile(blob, filename) {
  if (!isNativeApp()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  // Only loaded inside the app
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: `Save or share ${filename}` });
  } catch (err) {
    // Closing the share sheet isn't an error
    if (!/cancel/i.test(err?.message || "")) throw err;
  }
}
