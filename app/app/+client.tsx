console.log(import.meta.hot.on('vite:beforeFullReload', () => {
    console.log('hot')
}))