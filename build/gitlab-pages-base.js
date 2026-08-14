const pagesUrl = process.env.CI_PAGES_URL;

if (!pagesUrl) throw new Error('CI_PAGES_URL is required for GitLab Pages builds.');
const pathname = new URL(pagesUrl).pathname;
process.stdout.write(pathname.endsWith('/') ? pathname : `${pathname}/`);
