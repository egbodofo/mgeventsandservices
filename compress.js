const sharp = require("sharp");
const cron = require("node-cron");
const fs = require("fs-extra");
const path = require("path");

const INPUT_DIR = path.join(__dirname, "img");
const OUTPUT_DIR = path.join(__dirname, "compressed_img");
const SUPPORTED_FORMATS = [".jpg", ".jpeg", ".png", ".webp"];

// Compress a single image with quality optimization
async function compressImage(inputPath, outputPath) {
  try {
    await fs.ensureDir(path.dirname(outputPath));
    const ext = path.extname(inputPath).toLowerCase();

    let pipeline = sharp(inputPath);
    if (ext === ".jpg" || ext === ".jpeg") {
      pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    } else if (ext === ".png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (ext === ".webp") {
      pipeline = pipeline.webp({ quality: 80 });
    }

    await pipeline.toFile(outputPath);
    console.log("✅ Compressed:", path.relative(__dirname, outputPath));
  } catch (err) {
    console.error("❌ Error compressing", inputPath, err);
  }
}

// Get all image file paths recursively
async function getAllImages(dir) {
  const results = [];
  const files = await fs.readdir(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      results.push(...(await getAllImages(fullPath)));
    } else if (SUPPORTED_FORMATS.includes(path.extname(file).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

// Sync images: compress new or updated, remove deleted ones
async function syncCompressedImages() {
  console.log("\n🕒 Checking for changes at", new Date().toLocaleTimeString());

  const sourceImages = await getAllImages(INPUT_DIR);
  const compressedImages = await getAllImages(OUTPUT_DIR).catch(() => []);

  const compressedSet = new Set(
    compressedImages.map(img =>
      path.relative(OUTPUT_DIR, img).replace(/\\/g, "/")
    )
  );

  // Compress new or updated images
  for (const src of sourceImages) {
    const relativePath = path.relative(INPUT_DIR, src).replace(/\\/g, "/");
    const dest = path.join(OUTPUT_DIR, relativePath);

    const srcStat = await fs.stat(src);
    let needsCompression = false;

    if (!await fs.pathExists(dest)) {
      needsCompression = true; // new image
    } else {
      const destStat = await fs.stat(dest);
      if (srcStat.mtimeMs > destStat.mtimeMs) {
        needsCompression = true; // modified image
      }
    }

    if (needsCompression) {
      await compressImage(src, dest);
    }
    compressedSet.delete(relativePath); // mark as still valid
  }

  // Remove images that were deleted from source
  for (const leftover of compressedSet) {
    const fullPath = path.join(OUTPUT_DIR, leftover);
    await fs.remove(fullPath);
    console.log("🗑️ Removed outdated:", leftover);
  }

  console.log("✅ Sync completed.\n");
}

// Schedule: every 2 minutes
cron.schedule("*/2 * * * *", syncCompressedImages);

// Run immediately
(async () => {
  console.log("🚀 Starting smart image compression watcher...");
  await fs.ensureDir(OUTPUT_DIR);
  await syncCompressedImages();
})();