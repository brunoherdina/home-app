import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Camada dinâmica sobre `app.json` — o Expo lê o JSON primeiro e o entrega aqui
 * como `config`. O estático continua sendo a fonte de tudo que não depende de
 * contexto; aqui mora só o que precisa olhar para o ambiente do build.
 *
 * Hoje há um único caso, e ele é de segurança: HTTP em claro.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // `EAS_BUILD_PROFILE` existe nos servidores do EAS; localmente (expo start,
  // expo run) é undefined, e o padrão precisa ser o permissivo — senão o
  // desenvolvimento com a API na LAN para de funcionar.
  const perfil = process.env.EAS_BUILD_PROFILE ?? 'development'
  const ehProducao = perfil === 'production'

  return {
    ...config,
    name: config.name ?? 'Casa',
    slug: config.slug ?? 'casa',
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            /**
             * Android 9+ bloqueia HTTP em claro por padrão, e o build de release
             * NÃO herda a exceção que o modo debug tem. Sem isto, o APK de
             * preview instala, abre e falha em toda request contra
             * `http://192.168.68.102:3333` — com um erro de rede genérico, que
             * é exatamente o sintoma que manda procurar no lugar errado.
             *
             * Ligado só fora de `production` de propósito. A API de casa é HTTP
             * simples na LAN; o dia em que existir build de produção, ela estará
             * atrás de TLS (ADR-0001, Caddy na VPS) e esta permissão não deve ir
             * junto — cleartext habilitado em produção transforma qualquer Wi-Fi
             * hostil em leitura de token.
             */
            usesCleartextTraffic: !ehProducao,
          },
        },
      ],
    ],
  }
}
