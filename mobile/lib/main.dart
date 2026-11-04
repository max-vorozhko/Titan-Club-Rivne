import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'navigation_policy.dart';

const _brand = Color(0xFFF85A0A);
const _graphite = Color(0xFF33333A);
const _background = Color(0xFFF4F4F5);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.white,
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarColor: _graphite,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const TitanRunApp());
}

class TitanRunApp extends StatelessWidget {
  const TitanRunApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Titan Run',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: _brand),
        scaffoldBackgroundColor: _background,
        useMaterial3: true,
      ),
      home: const GameScreen(),
    );
  }
}

/// Гра Titan Run з сайту клубу на весь екран. Оновлення гри приходять з сайту, перевстановлювати додаток не треба.
class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late final WebViewController _controller;
  bool _loaded = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(_background)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: _onNavigationRequest,
        onPageFinished: (_) {
          if (!mounted) return;
          setState(() {
            _loaded = true;
            _failed = false;
          });
        },
        onWebResourceError: (error) {
          // Показуємо екран помилки лише коли не завантажилась сама сторінка, а не окрема картинка чи шрифт
          if ((error.isForMainFrame ?? false) && mounted) setState(() => _failed = true);
        },
      ))
      ..loadRequest(siteUri);
  }

  NavigationDecision _onNavigationRequest(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null || opensInsideApp(uri)) return NavigationDecision.navigate;
    launchUrl(uri, mode: LaunchMode.externalApplication);
    return NavigationDecision.prevent;
  }

  /// «Назад»: спершу закриває вікно чи повертає з режиму на головну (це вміє сама гра), потім історія, потім вихід.
  Future<void> _onBack() async {
    try {
      final handled = await _controller.runJavaScriptReturningResult('window.titanBack ? window.titanBack() : false');
      if (handled.toString() == 'true') return;
    } catch (_) {}
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  void _retry() {
    setState(() => _failed = false);
    _controller.loadRequest(siteUri);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_failed && !_loaded) _OfflineView(onRetry: _retry),
              IgnorePointer(
                ignoring: _loaded,
                child: AnimatedOpacity(
                  opacity: _loaded ? 0 : 1,
                  duration: const Duration(milliseconds: 250),
                  child: _failed ? const SizedBox.shrink() : const _Splash(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: _background,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset('assets/logo.png', width: 220),
          const SizedBox(height: 24),
          const SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 3, color: _brand),
          ),
        ],
      ),
    );
  }
}

class _OfflineView extends StatelessWidget {
  const _OfflineView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: _background,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset('assets/logo.png', width: 160),
          const SizedBox(height: 24),
          const Text(
            'Немає з’єднання',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: _graphite),
          ),
          const SizedBox(height: 8),
          const Text(
            'Перевір інтернет і спробуй ще раз.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 15, color: Color(0xFF6C6C77)),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: onRetry,
            style: FilledButton.styleFrom(backgroundColor: _brand, padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14)),
            child: const Text('Спробувати ще', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
