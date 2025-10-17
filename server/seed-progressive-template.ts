import { apiRequest } from './seed-data-helpers';

export async function seedProgressiveTemplate() {
  console.log('🌱 Seeding Progressive configurator template...');

  try {
    // Create Progressive template
    const templateResponse = await fetch('http://localhost:5000/api/configurator-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Progressive Motor & Accessories Configurator',
        manufacturer: 'Progressive',
        description: 'Configure Gaposa motors, remotes, and accessories for your project',
        isActive: true,
      }),
    });

    if (!templateResponse.ok) {
      throw new Error(`Failed to create template: ${await templateResponse.text()}`);
    }

    const template = await templateResponse.json();
    const templateId = template.id;
    console.log(`✅ Created template: ${template.name} (ID: ${templateId})`);

    // Create fields
    const fields = [
      {
        fieldName: 'project_type',
        fieldLabel: 'Project Type',
        fieldType: 'select',
        isRequired: true,
        displayOrder: 0,
        category: 'Basic Information',
        fieldOptions: [
          { value: 'motorized_screens', label: 'Motorized Screens' },
          { value: 'motorized_shutters', label: 'Motorized Shutters' },
          { value: 'retrofit', label: 'Retrofit/Replacement' },
        ],
        helpText: 'Select the type of project you are configuring',
      },
      {
        fieldName: 'motor_speed',
        fieldLabel: 'Motor Speed Required',
        fieldType: 'select',
        isRequired: false,
        displayOrder: 1,
        category: 'Motor Specifications',
        fieldOptions: [
          { value: '21rpm', label: '21 RPM (Standard Screens)' },
          { value: '16rpm', label: '16 RPM (Heavy Screens)' },
          { value: '90rpm', label: '90 RPM (Light Shutters)' },
        ],
        helpText: 'Select motor speed based on screen/shutter weight',
      },
      {
        fieldName: 'motors',
        fieldLabel: 'Select Motors',
        fieldType: 'product_list',
        isRequired: false,
        displayOrder: 2,
        category: 'Motor Specifications',
        helpText: 'Choose replacement motors for your project',
      },
      {
        fieldName: 'remote_type',
        fieldLabel: 'Remote Control Type',
        fieldType: 'select',
        isRequired: false,
        displayOrder: 3,
        category: 'Controls',
        fieldOptions: [
          { value: 'wall_mount', label: 'Wall Mount Remote' },
          { value: 'in_wall', label: 'In-Wall Remote' },
          { value: 'smart_line', label: 'Emitto Smart Line' },
        ],
      },
      {
        fieldName: 'channel_count',
        fieldLabel: 'Number of Channels',
        fieldType: 'select',
        isRequired: false,
        displayOrder: 4,
        category: 'Controls',
        fieldOptions: [
          { value: '1', label: '1 Channel (Single Screen)' },
          { value: '5', label: '5 Channels (Multiple Screens)' },
          { value: '16', label: '16 Channels (Full System)' },
        ],
      },
      {
        fieldName: 'remotes',
        fieldLabel: 'Select Remotes',
        fieldType: 'product_list',
        isRequired: false,
        displayOrder: 5,
        category: 'Controls',
        helpText: 'Add remote controls to your configuration',
      },
      {
        fieldName: 'accessories',
        fieldLabel: 'Additional Accessories',
        fieldType: 'product_list',
        isRequired: false,
        displayOrder: 6,
        category: 'Accessories',
        helpText: 'Add extension cords, sensors, or other accessories',
      },
      {
        fieldName: 'special_notes',
        fieldLabel: 'Special Installation Notes',
        fieldType: 'text',
        isRequired: false,
        displayOrder: 7,
        category: 'Additional Information',
        helpText: 'Any special requirements or notes for this configuration',
      },
    ];

    for (const field of fields) {
      const fieldResponse = await fetch(`http://localhost:5000/api/configurator-templates/${templateId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(field),
      });

      if (!fieldResponse.ok) {
        throw new Error(`Failed to create field ${field.fieldName}: ${await fieldResponse.text()}`);
      }

      const createdField = await fieldResponse.json();
      console.log(`  ✅ Created field: ${createdField.fieldLabel}`);
    }

    // Create conditional rules
    const rules = [
      {
        triggerFieldName: 'project_type',
        triggerCondition: 'equals',
        triggerValue: 'motorized_screens',
        actionType: 'show_field',
        targetFieldName: 'motor_speed',
      },
      {
        triggerFieldName: 'project_type',
        triggerCondition: 'equals',
        triggerValue: 'motorized_shutters',
        actionType: 'show_field',
        targetFieldName: 'motor_speed',
      },
      {
        triggerFieldName: 'remote_type',
        triggerCondition: 'equals',
        triggerValue: 'wall_mount',
        actionType: 'show_field',
        targetFieldName: 'channel_count',
      },
      {
        triggerFieldName: 'remote_type',
        triggerCondition: 'equals',
        triggerValue: 'in_wall',
        actionType: 'show_field',
        targetFieldName: 'channel_count',
      },
      {
        triggerFieldName: 'remote_type',
        triggerCondition: 'equals',
        triggerValue: 'smart_line',
        actionType: 'show_field',
        targetFieldName: 'channel_count',
      },
    ];

    for (const rule of rules) {
      const ruleResponse = await fetch(`http://localhost:5000/api/configurator-templates/${templateId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });

      if (!ruleResponse.ok) {
        throw new Error(`Failed to create rule: ${await ruleResponse.text()}`);
      }

      const createdRule = await ruleResponse.json();
      console.log(`  ✅ Created rule: IF ${rule.triggerFieldName} ${rule.triggerCondition} "${rule.triggerValue}" THEN ${rule.actionType} ${rule.targetFieldName}`);
    }

    console.log('✅ Progressive template seeded successfully!');
    console.log('\n📋 Template Summary:');
    console.log(`   - Name: ${template.name}`);
    console.log(`   - Manufacturer: ${template.manufacturer}`);
    console.log(`   - Fields: ${fields.length}`);
    console.log(`   - Rules: ${rules.length}`);
    console.log(`   - Status: ${template.isActive ? 'Active' : 'Inactive'}`);

  } catch (error) {
    console.error('❌ Error seeding Progressive template:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedProgressiveTemplate()
    .then(() => {
      console.log('\n✨ Seed complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Seed failed:', error);
      process.exit(1);
    });
}
