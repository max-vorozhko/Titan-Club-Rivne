import 'package:flutter_test/flutter_test.dart';
import 'package:titan_run/navigation_policy.dart';

void main() {
  group('opensInsideApp', () {
    test('гра і її сторінки лишаються в додатку', () {
      expect(opensInsideApp(Uri.parse('https://max-vorozhko.github.io/Titan-Club-Rivne/')), isTrue);
      expect(opensInsideApp(Uri.parse('https://max-vorozhko.github.io/Titan-Club-Rivne/index.html?source=pwa')), isTrue);
      expect(opensInsideApp(Uri.parse('about:blank')), isTrue);
    });

    test('адмінка відкривається в браузері, бо Google не пускає вхід у вбудованому', () {
      expect(opensInsideApp(Uri.parse('https://max-vorozhko.github.io/Titan-Club-Rivne/admin.html')), isFalse);
    });

    test('чужі сайти й месенджери відкриваються назовні', () {
      expect(opensInsideApp(Uri.parse('https://www.instagram.com/titan.club.rivne')), isFalse);
      expect(opensInsideApp(Uri.parse('https://t.me/share/url?url=x')), isFalse);
      expect(opensInsideApp(Uri.parse('viber://forward?text=x')), isFalse);
      expect(opensInsideApp(Uri.parse('https://send.monobank.ua/jar/A25V4sTs2g')), isFalse);
      expect(opensInsideApp(Uri.parse('mailto:a@b.c')), isFalse);
    });

    test('той самий домен, але інший проєкт, не наш', () {
      expect(opensInsideApp(Uri.parse('https://max-vorozhko.github.io/other/')), isFalse);
      expect(opensInsideApp(Uri.parse('https://evil.example/https://max-vorozhko.github.io/Titan-Club-Rivne/')), isFalse);
    });
  });
}
