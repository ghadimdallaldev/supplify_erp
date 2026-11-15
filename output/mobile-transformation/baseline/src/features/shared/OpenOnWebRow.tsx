import { Linking } from 'react-native'
import { ListRow } from '../../components/ui'
import { webAppUrl } from '../../utils/webAppUrl'

type OpenOnWebRowProps = {
  title: string
  path: string
}

export function OpenOnWebRow({ title, path }: OpenOnWebRowProps) {
  return (
    <ListRow
      icon="open-outline"
      title={title}
      compact
      onPress={() => {
        void Linking.openURL(webAppUrl(path))
      }}
    />
  )
}
