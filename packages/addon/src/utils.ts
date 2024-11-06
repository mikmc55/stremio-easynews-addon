 { EasynewsSearchResponse, FileData } from '@easynews/api';
import { MetaProviderResponse } from './meta';
import { ContentType } from 'stremio-addon-sdk';
import { parse as parseTorrentTitle } from 'parse-torrent-title';

export function isBadVideo(file: FileData) {
  const duration = file['14'] ?? '';

  return (
    duration.match(/^\d+s/) ||
    duration.match('^[0-5]m') ||
    file.passwd ||
    file.virus ||
    file.type.toUpperCase() !== 'VIDEO'
  );
}

export function sanitizeTitle(title: string) {
  return (
    title
      // Normalize accents (e.g., é -> e, à -> a)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Replace common separators with spaces
      .replaceAll('-', ' ')
      .replaceAll('_', ' ')
      .replaceAll('.', ' ')
      // Keep apostrophes
      .replace(/[^\w\s']/g, '') 
      // Replace multiple spaces with a single space
      .replace(/\s+/g, ' ') 
      // Remove spaces at the beginning and end
      .trim()
  );
}

export function cleanTitle(name = "") {
  return sanitizeTitle(name)
    .toLowerCase()
    .replace(/\s+the\s+/g, " ")
    .replace(/\s+and\s+/g, " ")
    .replace(/\s+of\s+/g, " ")
    .replace(/\s+in\s+/g, " ")
    .replace(/\s+to\s+/g, " ")
    .replace(/\s+it\s+/g, " ")
    .replace(/\s+is\s+/g, " ")
    .replace(/\s+for\s+/g, " ")
    .replace(/\s+that\s+/g, " ")
    .replace(/\s+on\s+/g, " ")
    .replace(/\s+at\s+/g, " ")
    .replace(/\s+with\s+/g, " ")
    .replace(/\s+a\s+/g, " ")
    .replace(/\s+an\s+/g, " ")
    .trim();
}

export function matchesTitle(title: string, query: string, strict: boolean) {
  const sanitizedQuery = cleanTitle(query).toLowerCase().trim();

  if (strict) {
    const { title: movieTitle } = parseTorrentTitle(title);
    if (movieTitle) {
      return cleanTitle(movieTitle).toLowerCase().trim() === sanitizedQuery;
    }
  }

  const sanitizedTitle = cleanTitle(title).toLowerCase().trim();
  
  // Updated to use `includes` for a flexible match
  return sanitizedTitle.includes(sanitizedQuery);
}

export function createStreamUrl({
  downURL,
  dlFarm,
  dlPort,
}: Pick<EasynewsSearchResponse, 'downURL' | 'dlFarm' | 'dlPort'>) {
  return `${downURL}/${dlFarm}/${dlPort}`;
}

export function createStreamPath(file: FileData) {
  const postHash = file['0'] ?? '';
  const postTitle = file['10'] ?? '';
  const ext = file['11'] ?? '';

  return `${postHash}${ext}/${postTitle}${ext}`;
}

export function createStreamAuth(username: string, password: string) {
  return `Authorization=${encodeURIComponent(username + ':' + password)}`;
}

export function getFileExtension(file: FileData) {
  return file['2'] ?? '';
}

export function getPostTitle(file: FileData) {
  return file['10'] ?? '';
}

export function getDuration(file: FileData) {
  return file['14'] ?? '';
}

export function getSize(file: FileData) {
  return file['4'] ?? '';
}

export function getQuality(
  title: string,
  fallbackResolution?: string
): string | undefined {
  const { resolution } = parseTorrentTitle(title);
  return resolution ?? fallbackResolution;
}

export function createThumbnailUrl(
  res: EasynewsSearchResponse,
  file: FileData
) {
  const id = file['0'];
  const idChars = id.slice(0, 3);
  const thumbnailSlug = file['10'];
  return `${res.thumbURL}${idChars}/pr-${id}.jpg/th-${thumbnailSlug}.jpg`;
}

export function extractDigits(value: string) {
  const match = value.match(/\d+/);

  if (match) {
    return parseInt(match[0], 10);
  }

  return undefined;
}

export function buildSearchQuery(
  type: ContentType,
  meta: MetaProviderResponse
) {
  let query = `${meta.name}`;

  if (type === 'series') {
    if (meta.season) {
      query += ` S${meta.season.toString().padStart(2, '0')}`;
    }

    if (meta.episode) {
      query += `${!meta.season ? ' ' : ''}E${meta.episode.toString().padStart(2, '0')}`;
    }
  }

  if (meta.year) {
    query += ` ${meta.year}`;
  }

  return query;
}

export function logError(message: {
  message: string;
  error: unknown;
  context: unknown;
}) {
  console.error(message);
}

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Test functions
function testSanitizeTitle() {
  console.log("Sanitize Title Tests:");
  console.log(sanitizeTitle("America's"));          // Expected: "America's"
  console.log(sanitizeTitle("Amérîcâ"));            // Expected: "America"
  console.log(sanitizeTitle("Am_er-ic.a"));         // Expected: "Am er ic a"
  console.log(sanitizeTitle("D'où vient-il?"));     // Expected: "D'où vient il"
  console.log(sanitizeTitle("Fête du cinéma"));     // Expected: "Fete du cinema"
}

function testMatchesTitle() {
  console.log("\nMatches Title Tests:");
  console.log(matchesTitle("America's Next Top Model", "America's", false)); // Expected: true
  console.log(matchesTitle("Amérîcâ's Got Talent", "America", false));       // Expected: true
  console.log(matchesTitle("Am_er-ic.a the Beautiful", "America the Beautiful", false)); // Expected: true
  console.log(matchesTitle("La fête de l'été", "fete", false));              // Expected: true
  console.log(matchesTitle("Fête du cinéma", "cinema", false));              // Expected: true
}

// Run tests
testSanitizeTitle();
testMatchesTitle();
