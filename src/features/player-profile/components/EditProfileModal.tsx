import { useState, useEffect } from 'react';
import { ScrollView, View, Image, Pressable, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { Modal } from '@/components/feedback/Modal';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { type PlayerProfile } from '@/features/player-profile/types';

export type EditProfileModalProps = {
  visible: boolean;
  profile: PlayerProfile;
  onClose: () => void;
  onSave: (data: Partial<PlayerProfile>) => Promise<void>;
  onUploadImage: (fileUri: string, type: 'avatar' | 'cover') => Promise<string>;
};

export function EditProfileModal({
  visible,
  profile,
  onClose,
  onSave,
  onUploadImage,
}: EditProfileModalProps) {
  const { colors } = useTheme();

  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [club, setClub] = useState('');
  const [nationality, setNationality] = useState('');
  const [preferredFoot, setPreferredFoot] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [biography, setBiography] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setFullName(profile.fullName || '');
      setPosition(profile.position || '');
      setClub(profile.club || '');
      setNationality(profile.nationality || '');
      setPreferredFoot(profile.preferredFoot || '');
      setHeight(profile.height || '');
      setWeight(profile.weight || '');
      setBiography(profile.biography || '');
    }
  }, [visible, profile]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name is required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        fullName,
        position,
        club,
        nationality,
        preferredFoot,
        height,
        weight,
        biography,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleImagePick = async (type: 'avatar' | 'cover') => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access gallery is required to pick an image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [3, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        if (type === 'avatar') {
          setUploadingAvatar(true);
        } else {
          setUploadingCover(true);
        }

        try {
          await onUploadImage(uri, type);
        } catch (uploadErr) {
          Alert.alert('Upload Error', uploadErr instanceof Error ? uploadErr.message : 'Failed to upload image.');
        } finally {
          setUploadingAvatar(false);
          setUploadingCover(false);
        }
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'An error occurred while picking image.');
    }
  };

  const footer = (
    <View className="flex-row gap-3">
      <Button variant="secondary" className="flex-1" onPress={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" className="flex-1" onPress={handleSave} loading={saving}>
        Save
      </Button>
    </View>
  );

  return (
    <Modal visible={visible} onClose={onClose} title="Edit Profile" size="sheet" footer={footer}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cover Image */}
        <View className="relative mb-6 rounded-xl overflow-hidden bg-neutral-800">
          <Image
            source={{ uri: profile.coverImageUrl }}
            className="h-32 w-full opacity-60"
            resizeMode="cover"
          />
          {uploadingCover ? (
            <View className="absolute inset-0 items-center justify-center bg-black/50">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <Pressable
              onPress={() => void handleImagePick('cover')}
              className="absolute inset-0 items-center justify-center bg-black/30 active:bg-black/45"
            >
              <View className="flex-row items-center gap-2 rounded-full bg-black/60 px-4 py-2">
                <Camera size={16} color="white" />
                <Text className="text-white text-xs font-sans-medium">Change Cover Photo</Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Avatar Upload */}
        <View className="items-center -mt-16 mb-6">
          <View className="relative h-24 w-24 rounded-full overflow-hidden border-4 border-surface dark:border-neutral-900 bg-neutral-800">
            <Image source={{ uri: profile.avatarUrl }} className="h-full w-full opacity-70" />
            {uploadingAvatar ? (
              <View className="absolute inset-0 items-center justify-center bg-black/50">
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <Pressable
                onPress={() => void handleImagePick('avatar')}
                className="absolute inset-0 items-center justify-center bg-black/20 active:bg-black/35"
              >
                <Camera size={20} color="white" />
              </Pressable>
            )}
          </View>
          <Text variant="caption" color="secondary" className="mt-2">
            Tap avatar to upload new photo
          </Text>
        </View>

        {/* Form Fields */}
        <View className="gap-4">
          <Input label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Mateo Alvarez" />

          <Input label="Position" value={position} onChangeText={setPosition} placeholder="Attacking Midfielder" />

          <Input label="Club" value={club} onChangeText={setClub} placeholder="Northstar FC" />

          <View className="flex-row gap-4">
            <Input
              label="Nationality"
              value={nationality}
              onChangeText={setNationality}
              placeholder="Chilean"
              containerClassName="flex-1"
            />

            <Input
              label="Preferred Foot"
              value={preferredFoot}
              onChangeText={setPreferredFoot}
              placeholder="Right / Left"
              containerClassName="flex-1"
            />
          </View>

          <View className="flex-row gap-4">
            <Input
              label="Height"
              value={height}
              onChangeText={setHeight}
              placeholder="178 cm"
              containerClassName="flex-1"
            />

            <Input
              label="Weight"
              value={weight}
              onChangeText={setWeight}
              placeholder="72 kg"
              containerClassName="flex-1"
            />
          </View>

          <Input
            label="Biography"
            value={biography}
            onChangeText={setBiography}
            placeholder="Write a brief overview of your skills and career details..."
            multiline
            numberOfLines={4}
            inputClassName="min-h-[100px] text-top"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}
