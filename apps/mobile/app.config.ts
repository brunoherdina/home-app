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
  const falaComApiNaLan = perfil === 'development'

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
             * NÃO herda a exceção que o modo debug tem. Quem precisa dela é só
             * quem fala com a API na LAN (`http://<ip>:3333`): o expo start e o
             * dev client (perfil `development`). Sem ela, esse build instala,
             * abre e falha em toda request com um erro de rede genérico — o
             * sintoma que manda procurar no lugar errado.
             *
             * `preview` e `production` falam com https://casa.prumoz.com.br
             * (ADR-0014) e ficam SEM a permissão: cleartext ligado num APK que
             * anda por aí transforma qualquer Wi-Fi hostil em leitura de token.
             */
            usesCleartextTraffic: falaComApiNaLan,
          },
        },
      ],
    ],
  }
}
