#!/usr/bin/env node
/**
 * crop-images-1to1.mjs
 * Retalla totes les imatges de assets/images/ a 1:1 (quadrat)
 * Mantenint el centre de la imatge (crop center)
 *
 * Usage: node tools/crop-images-1to1.mjs [--dry-run]
 */

import { promises as fs } from 'node:fs';
import { resolve, relative, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMAGES_DIR = resolve(ROOT, 'assets/images');

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const DRY_RUN = process.argv.includes('--dry-run');

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(full));
        } else if (/\.(webp|png|jpg|jpeg)$/i.test(entry.name)) {
            files.push(full);
        }
    }
    return files;
}

async function cropToSquare(inputPath) {
    const rel = relative(IMAGES_DIR, inputPath);

    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        const { width, height } = metadata;

        if (width === height) {
            console.log(`⏭  ${rel} - ja és 1:1 (${width}x${height})`);
            return { skipped: true, reason: 'already-square' };
        }

        const size = Math.min(width, height);
        const left = Math.floor((width - size) / 2);
        const top = Math.floor((height - size) / 2);

        if (DRY_RUN) {
            console.log(`🔍 [DRY-RUN] ${rel}: ${width}x${height} → ${size}x${size} (crop ${left},${top})`);
            return { dryRun: true };
        }

        // Write to temp file first, then rename (sharp doesn't allow in-place)
        const tempPath = inputPath + '.tmp';
        await image
            .extract({ left, top, width: size, height: size })
            .toFile(tempPath);

        // Replace original
        await fs.rename(tempPath, inputPath);

        console.log(`✅ ${rel}: ${width}x${height} → ${size}x${size}`);
        return { success: true, from: `${width}x${height}`, to: `${size}x${size}` };
    } catch (err) {
        console.error(`❌ ${rel}: ${err.message}`);
        return { error: true, message: err.message };
    }
}

async function main() {
    console.log(`📁 Escaneant ${IMAGES_DIR}...`);
    const files = await walk(IMAGES_DIR);
    console.log(`📸 Trobades ${files.length} imatges\n`);

    let processed = 0, skipped = 0, errors = 0;

    for (const file of files) {
        const result = await cropToSquare(file);
        if (result.success) processed++;
        else if (result.skipped) skipped++;
        else if (result.dryRun) processed++; // count as would-be-processed
        else errors++;
    }

    console.log(`\n📊 Resum:`);
    console.log(`   Processades: ${processed}`);
    console.log(`   Omeses (ja 1:1): ${skipped}`);
    if (errors) console.log(`   Errors: ${errors}`);
    if (DRY_RUN) console.log(`\n⚠️  Mode DRY-RUN - cap fitxer modificat. Executa sense --dry-run per aplicar.`);
}

main().catch(console.error);