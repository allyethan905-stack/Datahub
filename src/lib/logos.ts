
/**
 * Utility to generate team logo URLs from SportyTech API
 */
export const getTeamLogo = (teamName: string | undefined): string => {
  if (!teamName || typeof teamName !== 'string') return '';
  // The API requires space encoding for names like "A. Villa"
  const formatted = encodeURIComponent(teamName.trim());
  return `https://storage-prod.sporty-tech.net/virtual/teams/${formatted}.png`;
};

/**
 * Utility to generate league flag URLs from SportyTech API
 */
export const getLeagueFlag = (countryCode: string | undefined): string => {
  if (!countryCode) return '';
  // Usually the flags are named by country code (GB, IT, ES, etc.)
  return `https://storage-prod.sporty-tech.net/flags/${countryCode.toUpperCase()}.png`;
};
