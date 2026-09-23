import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { fetchProductImage } from './image.mjs';
import { buildParameterRows } from './presentation.mjs';

const runFile = promisify(execFile);
const GENERATOR = fileURLToPath(new URL('../scripts/generate_product_pdf.py', import.meta.url));

function safeSlug(value) {
  const ascii = String(value || 'product').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return ascii.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).toLowerCase() || 'product';
}

function defaultOutputRoot() {
  if (process.env.KONTAKT_PDF_OUTPUT_DIR) return resolve(process.env.KONTAKT_PDF_OUTPUT_DIR);
  return join(process.env.USERPROFILE || homedir(), 'Documents', 'Kontakt Parameter', 'PDF');
}

function outputPathFor(result, outputRoot = defaultOutputRoot()) {
  const id = String(result?.id || 'result');
  return join(outputRoot, `${safeSlug(result?.productName)}-${safeSlug(id)}-v2.pdf`);
}

async function canAccess(path) {
  try { await access(path, constants.R_OK); return true; } catch { return false; }
}

async function pythonCandidates(explicit) {
  const profile = process.env.USERPROFILE || homedir();
  return [...new Set([
    explicit,
    process.env.KONTAKT_PDF_PYTHON,
    join(profile, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'),
    process.platform === 'win32' ? 'py' : 'python3',
    'python',
  ].filter(Boolean))];
}

async function runGenerator(inputPath, outputPath, { pythonExecutable, runner = runFile } = {}) {
  const failures = [];
  for (const candidate of await pythonCandidates(pythonExecutable)) {
    if ((candidate.includes('/') || candidate.includes('\\')) && !(await canAccess(candidate))) continue;
    const args = candidate === 'py' ? ['-3', GENERATOR, inputPath, outputPath] : [GENERATOR, inputPath, outputPath];
    try {
      await runner(candidate, args, { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch (error) {
      failures.push(`${candidate}: ${error?.message || error}`);
    }
  }
  throw new Error(`PDF runtime failed. ${failures.join(' | ')}`);
}

function imageExtension(mimeType) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[mimeType] || '.img';
}

export function buildPdfData(result, imagePath) {
  const params = buildParameterRows(result);
  const summary = result?.scrapedData?.summary || {};
  const sources = result?.scrapedData?.sourceCoverage || result?.scrapedData?.sources || [];
  const requiredFields = Number(summary.count || params.length);
  const foundFields = Number(summary.filled ?? params.filter(item => String(item.value || '').trim() && item.value !== '—').length);
  return {
    taskId: result?.id,
    productName: result?.productName,
    category: result?.category,
    updatedAt: result?.updatedAt,
    foundFields,
    requiredFields,
    coveragePercent: Number(summary.completenessPct ?? (requiredFields ? (foundFields / requiredFields) * 100 : 0)),
    sourceCount: sources.length,
    imagePath,
    parameters: params,
    sources,
  };
}

export async function generateProductPdf(result, {
  outputRoot = defaultOutputRoot(),
  fetchImage = fetchProductImage,
  pythonExecutable,
  runner,
} = {}) {
  if (!result?.id || !result?.productName) throw new Error('A saved product result is required to generate the PDF.');
  const images = result?.scrapedData?.productImages || [];
  if (!images.length) throw new Error('The saved result has no verified product image for the PDF.');
  await mkdir(outputRoot, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), 'kontakt-pdf-'));
  const destination = outputPathFor(result, outputRoot);
  try {
    let downloaded;
    const imageErrors = [];
    for (const candidate of images) {
      try { downloaded = await fetchImage(candidate.imageUrl || candidate.image_url); break; }
      catch (error) { imageErrors.push(error?.message || String(error)); }
    }
    if (!downloaded) throw new Error(`Verified product image could not be retrieved. ${imageErrors.join(' | ')}`);
    const imagePath = join(scratch, `product${imageExtension(downloaded.mimeType)}`);
    const inputPath = join(scratch, 'result.json');
    await writeFile(imagePath, Buffer.from(downloaded.data, 'base64'));
    await writeFile(inputPath, JSON.stringify(buildPdfData(result, imagePath), null, 2), 'utf8');
    const python = await runGenerator(inputPath, destination, { pythonExecutable, runner });
    const bytes = (await readFile(destination)).length;
    return {
      generated: true,
      path: destination,
      fileUri: pathToFileURL(destination).href,
      fileName: basename(destination),
      mimeType: 'application/pdf',
      bytes,
      template: 'kontakt-product-report-v2',
      pythonRuntime: basename(python),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

export async function existingProductPdf(result, { outputRoot = defaultOutputRoot() } = {}) {
  const path = outputPathFor(result, outputRoot);
  if (!(await canAccess(path))) return null;
  return { generated: true, path, fileUri: pathToFileURL(path).href, fileName: basename(path), mimeType: 'application/pdf', template: 'kontakt-product-report-v2' };
}
