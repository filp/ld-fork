import { Draggable } from '@hello-pangea/dnd';
import { FieldType, isField } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import isEqual from 'lodash/isEqual';
import React, { useEffect, type FC } from 'react';
import {
    TABLE_HEADER_BG,
    Th,
    ThActionsContainer,
    ThContainer,
    ThLabelContainer,
} from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';

interface TableHeaderProps {
    minimal?: boolean;
    showSubtotals?: boolean;
}

const TableHeader: FC<TableHeaderProps> = ({
    minimal = false,
    showSubtotals = true,
}) => {
    const { table, headerContextMenu, columns } = useTableContext();
    const HeaderContextMenu = headerContextMenu;
    const currentColOrder = React.useRef<Array<string>>([]);

    useEffect(() => {
        if (showSubtotals) {
            const groupedColumns: any = columns
                .filter(
                    (col: any) =>
                        col.meta?.item?.fieldType === FieldType.DIMENSION,
                )
                .map((col: any) => col.id);
            const sortedColumns: any = table
                .getState()
                .columnOrder.reduce((acc: any[], sortedId) => {
                    if (groupedColumns.includes(sortedId)) acc.push(sortedId);
                    return acc;
                }, []);
            sortedColumns.pop();

            if (!isEqual(sortedColumns, table.getState().grouping))
                table.setGrouping(sortedColumns);
        }
    }, [showSubtotals, columns, headerContextMenu, table]);

    useEffect(() => {
        if (!showSubtotals) table.resetGrouping();
    }, [showSubtotals, table]);

    if (columns.length <= 0) {
        return null;
    }

    return (
        <thead>
            {table.getHeaderGroups().map((headerGroup) => (
                <HeaderDndContext
                    key={headerGroup.id}
                    colOrderRef={currentColOrder}
                >
                    <HeaderDroppable headerGroup={headerGroup}>
                        {headerGroup.headers.map((header) => {
                            const meta = header.column.columnDef.meta;
                            const tooltipLabel =
                                meta?.item && isField(meta?.item)
                                    ? meta.item.description
                                    : undefined;

                            return (
                                <Th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        ...meta?.style,
                                        width: meta?.width,
                                        backgroundColor:
                                            meta?.bgColor ?? TABLE_HEADER_BG,
                                    }}
                                    className={meta?.className}
                                >
                                    <Draggable
                                        draggableId={header.id}
                                        index={header.index}
                                        isDragDisabled={
                                            minimal || !meta?.draggable
                                        }
                                    >
                                        {(provided, snapshot) => (
                                            <ThContainer>
                                                <ThLabelContainer
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    style={{
                                                        ...provided
                                                            .draggableProps
                                                            .style,
                                                        ...(!snapshot.isDragging && {
                                                            transform:
                                                                'translate(0,0)',
                                                        }),
                                                        ...(snapshot.isDropAnimating && {
                                                            transitionDuration:
                                                                '0.001s',
                                                        }),
                                                    }}
                                                >
                                                    <Tooltip
                                                        withinPortal
                                                        maw={400}
                                                        multiline
                                                        label={tooltipLabel}
                                                        position="top"
                                                        disabled={
                                                            !tooltipLabel ||
                                                            minimal ||
                                                            snapshot.isDropAnimating ||
                                                            snapshot.isDragging
                                                        }
                                                    >
                                                        <span>
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(
                                                                      header
                                                                          .column
                                                                          .columnDef
                                                                          .header,
                                                                      header.getContext(),
                                                                  )}
                                                        </span>
                                                    </Tooltip>
                                                </ThLabelContainer>

                                                {HeaderContextMenu && (
                                                    <ThActionsContainer>
                                                        <HeaderContextMenu
                                                            header={header}
                                                        />
                                                    </ThActionsContainer>
                                                )}
                                            </ThContainer>
                                        )}
                                    </Draggable>
                                </Th>
                            );
                        })}
                    </HeaderDroppable>
                </HeaderDndContext>
            ))}
        </thead>
    );
};

export default TableHeader;
