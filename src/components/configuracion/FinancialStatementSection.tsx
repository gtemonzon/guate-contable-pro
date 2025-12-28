import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { GripVertical, Trash2, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Section, SectionAccount, SectionType } from '@/hooks/useFinancialStatementFormat';

interface FinancialStatementSectionProps {
  section: Section;
  index: number;
  totalSections: number;
  onUpdate: (section: Section) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemoveAccount: (accountIndex: number) => void;
  onDrop: (e: React.DragEvent) => void;
}

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  group: 'Grupo',
  subtotal: 'Subtotal',
  total: 'Total',
  calculated: 'Calculado',
};

const SECTION_TYPE_COLORS: Record<SectionType, string> = {
  group: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  subtotal: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  total: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  calculated: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

export function FinancialStatementSection({
  section,
  index,
  totalSections,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRemoveAccount,
  onDrop,
}: FinancialStatementSectionProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-primary');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-primary');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-primary');
    onDrop(e);
  };

  return (
    <Card
      className="transition-all"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          
          <Input
            value={section.section_name}
            onChange={(e) => onUpdate({ ...section, section_name: e.target.value })}
            placeholder="Nombre de la sección"
            className="flex-1 h-8"
          />

          <Select
            value={section.section_type}
            onValueChange={(value: SectionType) => onUpdate({ ...section, section_type: value })}
          >
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="group">Grupo</SelectItem>
              <SelectItem value="subtotal">Subtotal</SelectItem>
              <SelectItem value="total">Total</SelectItem>
              <SelectItem value="calculated">Calculado</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onMoveDown}
              disabled={index === totalSections - 1}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 pb-3 px-4">
        <div className="min-h-[60px] bg-muted/50 rounded-md p-2">
          {section.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Arrastre cuentas aquí
            </p>
          ) : (
            <div className="space-y-1">
              {section.accounts.map((account, accountIndex) => (
                <div
                  key={account.account_id}
                  className="flex items-center justify-between bg-background rounded px-2 py-1 text-sm"
                >
                  <span>
                    <span className="font-mono text-muted-foreground">{account.account_code}</span>
                    {' - '}
                    {account.account_name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onRemoveAccount(accountIndex)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Badge className={`mt-2 ${SECTION_TYPE_COLORS[section.section_type]}`}>
          {SECTION_TYPE_LABELS[section.section_type]}
        </Badge>
      </CardContent>
    </Card>
  );
}
