import { Image, ImageStyle, StyleProp } from 'react-native';

export function Logo({ height = 28, style }: { height?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../assets/logo-wisp.png')}
      style={[{ height, width: height * 2.47, resizeMode: 'contain' }, style]}
    />
  );
}
