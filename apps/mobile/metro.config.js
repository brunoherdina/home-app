// Metro no monorepo: sem isto, o bundler não enxerga @casa/contracts nem os
// node_modules hasteados na raiz.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projeto = __dirname
const raiz = path.resolve(projeto, '../..')

const config = getDefaultConfig(projeto)

config.watchFolders = [raiz]
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, 'node_modules'),
  path.resolve(raiz, 'node_modules'),
]
// npm workspaces hasteia para a raiz; sem isto, uma cópia duplicada de react
// pode ser resolvida a partir de um pacote do workspace.
config.resolver.disableHierarchicalLookup = true

module.exports = config
