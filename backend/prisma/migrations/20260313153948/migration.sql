-- AlterTable
ALTER TABLE "entity_detail_configs" RENAME CONSTRAINT "entity_detail_configs_next_pkey" TO "entity_detail_configs_pkey";
ALTER TABLE "entity_detail_configs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_detail_section_configs" RENAME CONSTRAINT "entity_detail_section_configs_next_pkey" TO "entity_detail_section_configs_pkey";
ALTER TABLE "entity_detail_section_configs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_form_configs" RENAME CONSTRAINT "entity_form_configs_next_pkey" TO "entity_form_configs_pkey";
ALTER TABLE "entity_form_configs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_form_section_configs" RENAME CONSTRAINT "entity_form_section_configs_next_pkey" TO "entity_form_section_configs_pkey";
ALTER TABLE "entity_form_section_configs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_layout_assignments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_layout_configs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "entity_related_list_configs" RENAME CONSTRAINT "entity_related_list_configs_next_pkey" TO "entity_related_list_configs_pkey";
ALTER TABLE "entity_related_list_configs" ALTER COLUMN "id" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "entity_detail_configs" RENAME CONSTRAINT "entity_detail_configs_next_layoutConfigId_fkey" TO "entity_detail_configs_layoutConfigId_fkey";

-- RenameForeignKey
ALTER TABLE "entity_detail_section_configs" RENAME CONSTRAINT "entity_detail_section_configs_next_detailConfigId_fkey" TO "entity_detail_section_configs_detailConfigId_fkey";

-- RenameForeignKey
ALTER TABLE "entity_form_configs" RENAME CONSTRAINT "entity_form_configs_next_layoutConfigId_fkey" TO "entity_form_configs_layoutConfigId_fkey";

-- RenameForeignKey
ALTER TABLE "entity_form_section_configs" RENAME CONSTRAINT "entity_form_section_configs_next_formConfigId_fkey" TO "entity_form_section_configs_formConfigId_fkey";

-- RenameForeignKey
ALTER TABLE "entity_related_list_configs" RENAME CONSTRAINT "entity_related_list_configs_next_detailConfigId_fkey" TO "entity_related_list_configs_detailConfigId_fkey";

-- RenameIndex
ALTER INDEX "entity_detail_configs_next_layoutConfigId_key" RENAME TO "entity_detail_configs_layoutConfigId_key";

-- RenameIndex
ALTER INDEX "entity_detail_section_configs_next_detailConfigId_sortOrder_idx" RENAME TO "entity_detail_section_configs_detailConfigId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "entity_form_configs_next_layoutConfigId_key" RENAME TO "entity_form_configs_layoutConfigId_key";

-- RenameIndex
ALTER INDEX "entity_form_section_configs_next_formConfigId_sortOrder_idx" RENAME TO "entity_form_section_configs_formConfigId_sortOrder_idx";

-- RenameIndex
ALTER INDEX "entity_layout_assignments_recordTypeDeveloperName_permissionCod" RENAME TO "entity_layout_assignments_recordTypeDeveloperName_permissio_idx";

-- RenameIndex
ALTER INDEX "entity_related_list_configs_next_detailConfigId_relatedListId_k" RENAME TO "entity_related_list_configs_detailConfigId_relatedListId_key";

-- RenameIndex
ALTER INDEX "entity_related_list_configs_next_detailConfigId_sortOrder_idx" RENAME TO "entity_related_list_configs_detailConfigId_sortOrder_idx";
