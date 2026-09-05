import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const READER_URL =
  process.env.EXPO_PUBLIC_READER_URL ||
  'https://jhuang124.github.io/atlantic-reading-room/?app=expo&v=scroll-1';
const reader = new URL(READER_URL);
const openExternal = (url: string) => {
  if (/^https?:\/\//i.test(url)) void Linking.openURL(url).catch(() => {});
};

export default function App() {
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const backgroundColor = dark ? '#1b1b1e' : '#faf9f6';
  const color = dark ? '#f2f0eb' : '#242323';
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack.current) return false;
        web.current?.injectJavaScript(
          "window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true;",
        );
        return true;
      },
    );
    return () => subscription.remove();
  }, []);
  const retry = () => {
    setFailed(false);
    setLoading(true);
    web.current?.reload();
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, { backgroundColor }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar style={dark ? 'light' : 'dark'} />
        <WebView
          ref={web}
          source={{ uri: READER_URL }}
          style={[styles.container, { backgroundColor }]}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          setBuiltInZoomControls={false}
          onLoadStart={() => {
            setLoading(true);
            setFailed(false);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={({ nativeEvent }) => {
            if (new URL(nativeEvent.url).pathname === reader.pathname)
              setFailed(true);
          }}
          onContentProcessDidTerminate={() => setFailed(true)}
          onRenderProcessGone={() => setFailed(true)}
          onOpenWindow={({ nativeEvent }) =>
            openExternal(nativeEvent.targetUrl)
          }
          onShouldStartLoadWithRequest={(request) => {
            if (request.url === 'about:blank') return true;
            try {
              const next = new URL(request.url);
              if (
                next.origin === reader.origin &&
                next.pathname.startsWith(reader.pathname)
              )
                return true;
            } catch {
              return false;
            }
            openExternal(request.url);
            return false;
          }}
          onMessage={({ nativeEvent }) => {
            try {
              const message = JSON.parse(nativeEvent.data);
              if (message.type !== 'reader-state') return;
              setDark(message.theme === 'dark');
              canGoBack.current = message.canGoBack === true;
            } catch {
              /* Ignore non-reader messages. */
            }
          }}
        />
        {(loading || failed) && (
          <View
            style={[styles.overlay, { backgroundColor }]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[styles.wordmark, { color }]}>The Atlantic</Text>
            {failed ? (
              <>
                <Text style={[styles.message, { color }]}>
                  The archive couldn’t be opened. Check your connection and try
                  again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={retry}
                  style={styles.retry}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator
                color={dark ? '#ff6670' : '#c91420'}
                size="small"
                accessibilityLabel="Opening the archive"
              />
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  wordmark: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    fontSize: 38,
  },
  message: { fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 320 },
  retry: {
    backgroundColor: '#c91420',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 3,
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
