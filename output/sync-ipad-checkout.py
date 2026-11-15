from pathlib import Path
for repo in [Path(r'C:/myProjects/supplify-mobile'),Path(r'C:/myProjects/supplify-mobile-ios')]:
 for name in ['consumerCheckout.ts','consumerCheckout.test.ts']:
  (repo/'src/services/api'/name).write_bytes((Path('output')/('ipad-native-'+name)).read_bytes())
print('Public checkout retry contracts mirrored in Android and iOS')
