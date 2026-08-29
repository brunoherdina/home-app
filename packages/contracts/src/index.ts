// Imports internos SEM extensão, de propósito: o Metro (app Expo) não resolve
// './x.js' de volta para `x.ts`, e o tsx (API) aceita os dois — sem extensão os
// dois consumidores enxergam os mesmos arquivos.
export * from './auth'
export * from './casa'
export * from './comum'
export * from './morador'
export * from './saude'
