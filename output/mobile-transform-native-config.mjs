import fs from 'node:fs';import path from 'node:path';
const roots=['C:/myProjects/supplify-mobile','C:/myProjects/supplify-mobile-ios'];
const source=JSON.parse(fs.readFileSync(path.join(roots[0],'package.json'),'utf8'));
const pnpm=JSON.parse(fs.readFileSync('C:/myProjects/supplify_erp/node_modules/pnpm/package.json','utf8')).version;
for(const root of roots){
 if(fs.realpathSync(root).replaceAll('\\','/').toLowerCase()!==root.toLowerCase())throw Error('Unexpected repository path');
 const p=path.join(root,'package.json');const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
 pkg.dependencies=source.dependencies;pkg.devDependencies=source.devDependencies;pkg.packageManager='pnpm@'+pnpm;
 pkg.scripts.verify='pnpm typecheck && pnpm exec jest --runInBand && pnpm dlx expo-doctor';
 pkg.jest.setupFilesAfterEnv=['<rootDir>/jest.setup.js'];
 delete pkg.jest.resolver;
 pkg.jest.transformIgnorePatterns=['node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@tanstack/.*|react-native-gesture-handler)'];
 fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n');
 fs.writeFileSync(path.join(root,'jest.setup.js'),`require('react-native-gesture-handler/jestSetup')\njest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined), notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success', Error: 'error' } }))\n`);
 const resolver=path.join(root,'jest.resolver.js');if(fs.existsSync(resolver))fs.unlinkSync(resolver);
 if(root!==roots[0])fs.copyFileSync(path.join(roots[0],'pnpm-lock.yaml'),path.join(root,'pnpm-lock.yaml'));
 console.log(JSON.stringify({root,pnpm,dependencies:Object.keys(pkg.dependencies).length}));
}
