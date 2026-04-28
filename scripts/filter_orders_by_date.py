
import csv
import json
import ast

input_file = '/home/nhatbang/freeland/Luminew/backup_20260413_104222/orders_rows.csv'
output_file = '/home/nhatbang/freeland/Luminew/backup_20260413_104222/orders_rows_today.csv'
target_date = '2026-04-14'

def filter_and_minimize():
    count = 0
    try:
        # Standard fieldnames for the source
        source_fieldnames = []
        with open(input_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            source_fieldnames = reader.fieldnames
        
        # New fieldnames for output
        output_fieldnames = ['order_code', 'log']
        
        with open(input_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            with open(output_file, mode='w', encoding='utf-8', newline='') as out_f:
                writer = csv.DictWriter(out_f, fieldnames=output_fieldnames)
                writer.writeheader()
                
                for row in reader:
                    log_str = row.get('log', '')
                    order_code = row.get('order_code', '')
                    
                    cleaned_log = []
                    has_today_log = False
                    
                    if log_str:
                        try:
                            # Parse log
                            try:
                                log_data = json.loads(log_str)
                            except:
                                log_data = ast.literal_eval(log_str)
                            
                            if isinstance(log_data, list):
                                for entry in log_data:
                                    thoi_gian = entry.get('thoi_gian', '')
                                    if thoi_gian and target_date in thoi_gian:
                                        cleaned_log.append(entry)
                                        has_today_log = True
                        except:
                            # Catch unparseable logs if they contain today's date
                            if target_date in log_str:
                                has_today_log = True
                                # If we can't parse it, we can't easily clean it, 
                                # but the user wants it kept if it's for today.
                                cleaned_log = log_str 

                    # Only include row if log actually has data for today
                    if has_today_log:
                        output_row = {
                            'order_code': order_code,
                            'log': json.dumps(cleaned_log, ensure_ascii=False) if isinstance(cleaned_log, list) else cleaned_log
                        }
                        writer.writerow(output_row)
                        count += 1
        
        print(f"Successfully filtered {count} rows with today's log entries into {output_file}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    filter_and_minimize()
