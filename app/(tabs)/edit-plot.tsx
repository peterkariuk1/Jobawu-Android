/**
 * Edit Plot Page
 * Full CRUD operations for plots - view, search, edit, delete
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/page-header';
import { Sidebar } from '../../components/sidebar';
import { borderRadius, colors, spacing, typography } from '../../constants/design';
import { useThemedColors } from '../../hooks/use-themed-colors';
import { deletePlot, getAllPlots, PlotRecord, savePlot } from '../../services/firestore-service';

interface HouseUnit {
  id: string;
  houseNo: string;
  baseRent: number;
  garbageFees: number;
  previousWaterUnits: number;
  currentWaterUnits: number;
  tenant: string | null;
}

export default function EditPlot() {
  const themedColors = useThemedColors();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<PlotRecord | null>(null);
  
  // Edit form state
  const [editPlotName, setEditPlotName] = useState('');
  const [editHouses, setEditHouses] = useState<HouseUnit[]>([]);
  const [saving, setSaving] = useState(false);

  // Load plots from Firestore
  const loadPlots = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedPlots = await getAllPlots();
      
      // Generate unique IDs for houses if they don't have them
      const plotsWithIds = fetchedPlots.map(plot => ({
        ...plot,
        houses: plot.houses.map((house, index) => ({
          ...house,
          id: `house-${plot.id}-${index}-${Date.now()}`,
        } as HouseUnit)),
      }));
      
      setPlots(plotsWithIds);
    } catch (error) {
      console.error('[EditPlot] Error loading plots:', error);
      Alert.alert('Error', 'Failed to load plots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlots();
  }, [loadPlots]);

  // Filter plots by search query
  const filteredPlots = useMemo(() => {
    if (!searchQuery.trim()) return plots;
    
    const query = searchQuery.toLowerCase();
    return plots.filter(plot => {
      const plotNameMatch = plot.plotName.toLowerCase().includes(query);
      const houseMatch = plot.houses.some(house => 
        house.houseNo.toLowerCase().includes(query)
      );
      return plotNameMatch || houseMatch;
    });
  }, [plots, searchQuery]);

  // Handle edit plot button
  const handleEditPlot = (plot: PlotRecord) => {
    setSelectedPlot(plot);
    setEditPlotName(plot.plotName);
    // Map houses to add id field
    const housesWithIds = plot.houses.map((house, index) => ({
      ...house,
      id: `house-${plot.id}-${index}-${Date.now()}`,
    }));
    setEditHouses(housesWithIds);
    setEditModalVisible(true);
  };

  // Handle delete plot
  const handleDeletePlot = (plot: PlotRecord) => {
    Alert.alert(
      'Delete Plot',
      `Are you sure you want to delete "${plot.plotName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!plot.id) return;
            const success = await deletePlot(plot.id);
            if (success) {
              Alert.alert('Success', 'Plot deleted successfully');
              loadPlots();
            } else {
              Alert.alert('Error', 'Failed to delete plot');
            }
          },
        },
      ]
    );
  };

  // Handle save edited plot
  const handleSavePlot = async () => {
    if (!editPlotName.trim()) {
      Alert.alert('Error', 'Plot name is required');
      return;
    }

    if (editHouses.length === 0) {
      Alert.alert('Error', 'At least one house unit is required');
      return;
    }

    for (const house of editHouses) {
      if (!house.houseNo.trim()) {
        Alert.alert('Error', 'All house numbers must be filled');
        return;
      }
      if (house.baseRent <= 0) {
        Alert.alert('Error', `Base rent for ${house.houseNo} must be greater than 0`);
        return;
      }
    }

    setSaving(true);
    try {
      const numberOfUnits = editHouses.length;
      const totalRentAndGarbageExpected = editHouses.reduce(
        (sum, house) => sum + (house.baseRent || 0) + (house.garbageFees || 0),
        0
      );

      const plotData: PlotRecord = {
        id: selectedPlot?.id,
        plotName: editPlotName.trim(),
        houses: editHouses.map(house => ({
          houseNo: house.houseNo.trim(),
          baseRent: house.baseRent,
          garbageFees: house.garbageFees,
          previousWaterUnits: house.previousWaterUnits,
          currentWaterUnits: house.currentWaterUnits || house.previousWaterUnits,
          tenant: house.tenant,
        })),
        numberOfUnits,
        totalRentAndGarbageExpected,
      };

      const result = await savePlot(plotData);
      
      if (result.success) {
        Alert.alert('Success', 'Plot updated successfully');
        setEditModalVisible(false);
        loadPlots();
      } else {
        Alert.alert('Error', result.error || 'Failed to save plot');
      }
    } catch (error) {
      console.error('[EditPlot] Error saving:', error);
      Alert.alert('Error', 'Failed to save plot');
    } finally {
      setSaving(false);
    }
  };

  // Add unit to edit form
  const handleAddUnit = () => {
    const newUnit: HouseUnit = {
      id: `new-${Date.now()}`,
      houseNo: '',
      baseRent: 0,
      garbageFees: 0,
      previousWaterUnits: 0,
      currentWaterUnits: 0,
      tenant: null,
    };
    setEditHouses([...editHouses, newUnit]);
  };

  // Delete unit from edit form
  const handleDeleteUnit = (id: string) => {
    if (editHouses.length === 1) {
      Alert.alert('Error', 'Cannot delete the last unit. A plot must have at least one unit.');
      return;
    }

    // Check if unit is occupied
    const unitToDelete = editHouses.find(house => house.id === id);
    if (unitToDelete && unitToDelete.tenant) {
      Alert.alert(
        'Unit Occupied',
        `Cannot delete unit ${unitToDelete.houseNo} because it is currently occupied by a tenant. Remove the tenant first.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Unit',
      'Are you sure you want to delete this unit?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setEditHouses(editHouses.filter(house => house.id !== id));
          },
        },
      ]
    );
  };

  // Update house field in edit form
  const updateHouseField = (id: string, field: keyof HouseUnit, value: string | number) => {
    setEditHouses(editHouses.map(house =>
      house.id === id ? { ...house, [field]: value } : house
    ));
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
  };

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themedColors.background.secondary,
    },
    headerTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: themedColors.text.primary,
      letterSpacing: -0.3,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
      paddingVertical: spacing.xs,
    },
    plotCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    plotName: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: themedColors.text.primary,
      marginBottom: spacing.xs,
    },
    plotMeta: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    houseList: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: themedColors.border.main,
    },
    houseItem: {
      fontSize: typography.fontSize.sm,
      color: themedColors.text.secondary,
      marginBottom: 4,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.md,
      backgroundColor: themedColors.background.primary,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    modalTitle: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: themedColors.text.primary,
    },
    modalContent: {
      backgroundColor: themedColors.background.secondary,
    },
    label: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    labelSmall: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      color: themedColors.text.secondary,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: typography.fontSize.base,
      color: themedColors.text.primary,
    },
    inputSmall: {
      backgroundColor: themedColors.background.card,
      borderWidth: 1,
      borderColor: themedColors.border.main,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      fontSize: typography.fontSize.sm,
      color: themedColors.text.primary,
    },
    houseCard: {
      backgroundColor: themedColors.background.card,
      borderRadius: borderRadius.lg,
      padding: spacing.base,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: themedColors.border.main,
    },
    houseHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: themedColors.border.main,
    },
    houseTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.semibold,
      color: themedColors.primary[600],
    },
  }), [themedColors]);

  // Render plot card
  const renderPlotCard = ({ item }: { item: PlotRecord }) => (
    <View style={dynamicStyles.plotCard}>
      <Text style={dynamicStyles.plotName}>{item.plotName}</Text>
      <Text style={dynamicStyles.plotMeta}>
        {item.numberOfUnits} unit{item.numberOfUnits !== 1 ? 's' : ''}
      </Text>
      <Text style={dynamicStyles.plotMeta}>
        Total Expected: {formatCurrency(item.totalRentAndGarbageExpected)}
      </Text>
      
      <View style={dynamicStyles.houseList}>
        <Text style={[dynamicStyles.plotMeta, { fontWeight: '600' }]}>Units:</Text>
        {item.houses.map((house, index) => (
          <Text key={index} style={dynamicStyles.houseItem}>
            • {house.houseNo} - {formatCurrency(house.baseRent + house.garbageFees)}
          </Text>
        ))}
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditPlot(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeletePlot(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <PageHeader 
        title="Edit Plot" 
        onMenuPress={() => setSidebarOpen(true)} 
      />

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: themedColors.background.primary, borderBottomColor: themedColors.border.main }]}>
        <View style={[styles.searchInner, { backgroundColor: themedColors.background.tertiary }]}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Search plots or units..."
            placeholderTextColor={themedColors.text.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1, backgroundColor: themedColors.background.secondary }}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[500]} />
          </View>
        ) : filteredPlots.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ color: themedColors.text.tertiary, textAlign: 'center', fontSize: typography.fontSize.base }}>
              {plots.length === 0
                ? 'No plots yet. Create one on the Register Plot page.'
                : 'No plots match your search.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredPlots}
            renderItem={renderPlotCard}
            keyExtractor={(item) => item.id || Math.random().toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: themedColors.background.secondary }}>
          <View style={dynamicStyles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Text style={{ color: themedColors.text.primary, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
            <Text style={dynamicStyles.modalTitle}>Edit Plot</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView style={dynamicStyles.modalContent} contentContainerStyle={styles.modalScroll}>
            {/* Plot Name */}
            <View style={styles.section}>
              <Text style={dynamicStyles.label}>Plot Name *</Text>
              <TextInput
                style={dynamicStyles.input}
                value={editPlotName}
                onChangeText={setEditPlotName}
                placeholder="e.g., Sunshine Apartments"
                placeholderTextColor={themedColors.text.placeholder}
              />
            </View>

            {/* House Units */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={dynamicStyles.label}>House Units</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddUnit}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addButtonText}>+ Add Unit</Text>
                </TouchableOpacity>
              </View>

              {editHouses.map((house, index) => (
                <View key={house.id} style={dynamicStyles.houseCard}>
                  <View style={dynamicStyles.houseHeader}>
                    <Text style={dynamicStyles.houseTitle}>Unit {index + 1}</Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteUnit(house.id)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>House #</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.houseNo}
                        onChangeText={(value) => updateHouseField(house.id, 'houseNo', value)}
                        placeholder="A1"
                        placeholderTextColor={themedColors.text.placeholder}
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1.5 }]}>
                      <Text style={dynamicStyles.labelSmall}>Rent (KES)</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.baseRent ? house.baseRent.toString() : ''}
                        onChangeText={(value) => updateHouseField(house.id, 'baseRent', parseInt(value) || 0)}
                        placeholder="10000"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>Garbage</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.garbageFees ? house.garbageFees.toString() : ''}
                        onChangeText={(value) => updateHouseField(house.id, 'garbageFees', parseInt(value) || 0)}
                        placeholder="500"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={dynamicStyles.labelSmall}>Water Units</Text>
                      <TextInput
                        style={dynamicStyles.inputSmall}
                        value={house.previousWaterUnits ? house.previousWaterUnits.toString() : ''}
                        onChangeText={(value) => updateHouseField(house.id, 'previousWaterUnits', parseInt(value) || 0)}
                        placeholder="0"
                        placeholderTextColor={themedColors.text.placeholder}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Save Button */}
          <View style={[styles.modalFooter, { backgroundColor: themedColors.background.primary, borderTopColor: themedColors.border.main }]}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSavePlot}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  listContent: {
    padding: spacing.base,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editButton: {
    flex: 1,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: colors.error.light,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.error.dark,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  addButton: {
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
  },
  modalScroll: {
    padding: spacing.base,
  },
  inputGroup: {
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.error.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    color: colors.error.dark,
    fontWeight: typography.fontWeight.bold,
  },
  modalFooter: {
    padding: spacing.base,
    borderTopWidth: 1,
  },
  saveButton: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonDisabled: {
    backgroundColor: colors.primary[300],
  },
  saveButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
});
