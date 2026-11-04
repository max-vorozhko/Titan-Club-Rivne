/// Які адреси лишаються всередині додатка, а які відкриваються в браузері чи іншому додатку.
///
/// Всередині — лише сама гра. Адмінка (admin.html) відкривається в браузері, бо Google не пускає
/// вхід через вбудований браузер додатка. Усе інше (Instagram, Telegram, Viber, банка Monobank тощо)
/// теж відкривається поза додатком.
const siteHost = 'max-vorozhko.github.io';
const sitePath = '/Titan-Club-Rivne/';
final Uri siteUri = Uri.https(siteHost, sitePath);

bool opensInsideApp(Uri uri) {
  if (uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') return true;
  if (uri.scheme != 'https' && uri.scheme != 'http') return false;
  if (uri.host != siteHost) return false;
  if (!uri.path.startsWith(sitePath)) return false;
  if (uri.path.endsWith('/admin.html')) return false;
  return true;
}
